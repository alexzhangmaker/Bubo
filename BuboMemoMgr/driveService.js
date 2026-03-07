import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';

dotenv.config();

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL?.trim(),
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const CACHE_DIR = process.env.CACHE_DIR || './cache';
const IS_SYNC_ENABLED = process.env.ENABLE_CLOUD_SYNC !== 'false';

// Ensure cache directory exists
fs.ensureDirSync(CACHE_DIR);

/**
 * Syncs metadata from the Google Drive folder to the local SQLite database.
 */
export async function syncMetadata() {
    if (!IS_SYNC_ENABLED) {
        console.log('ℹ️ Cloud sync is disabled. Skipping metadata sync.');
        return;
    }
    if (!FOLDER_ID) {
        console.warn('⚠️ GOOGLE_DRIVE_FOLDER_ID not set in .env');
        return;
    }

    try {
        const res = await drive.files.list({
            q: `'${FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size, modifiedTime, webContentLink)',
        });

        const files = res.data.files || [];

        const upsertStmt = db.prepare(`
            INSERT INTO files (uuid, drive_id, name, mime_type, url, size, last_modified)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(drive_id) DO UPDATE SET
                name = excluded.name,
                mime_type = excluded.mime_type,
                url = excluded.url,
                size = excluded.size,
                last_modified = excluded.last_modified
        `);

        for (const file of files) {
            // Check if file already exists to keep the same UUID
            const existing = db.prepare('SELECT uuid FROM files WHERE drive_id = ?').get(file.id);
            const uuid = existing ? existing.uuid : uuidv4();

            upsertStmt.run(
                uuid,
                file.id,
                file.name,
                file.mimeType,
                file.webContentLink,
                file.size ? parseInt(file.size) : 0,
                file.modifiedTime
            );
        }

        console.log(`✅ Synced ${files.length} files metadata from Drive.`);
    } catch (error) {
        console.error('❌ Error syncing metadata:', error.message);
    }
}

/**
 * Downloads a file from Google Drive and caches it locally.
 */
export async function downloadAndCache(uuid) {
    const file = db.prepare('SELECT * FROM files WHERE uuid = ?').get(uuid);

    if (!file) throw new Error('File not found in database');
    if (file.cache_status === 'cached' && await fs.exists(file.cache_path)) {
        return file.cache_path;
    }

    if (!IS_SYNC_ENABLED) {
        throw new Error('Cloud sync is disabled and file is not cached locally.');
    }

    const driveId = file.drive_id;
    const destPath = path.join(CACHE_DIR, `${uuid}_${file.name}`);

    try {
        console.log(`📥 Downloading ${file.name} from Drive...`);
        const res = await drive.files.get(
            { fileId: driveId, alt: 'media' },
            { responseType: 'stream' }
        );

        const writer = fs.createWriteStream(destPath);
        res.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        db.prepare(`
            UPDATE files 
            SET cache_path = ?, cache_status = 'cached', last_cached_at = ? 
            WHERE uuid = ?
        `).run(destPath, new Date().toISOString(), uuid);

        console.log(`✅ Cached ${file.name} to ${destPath}`);
        return destPath;
    } catch (error) {
        db.prepare("UPDATE files SET cache_status = 'failed' WHERE uuid = ?").run(uuid);
        console.error(`❌ Failed to cache ${file.name}:`, error.message);
        throw error;
    }
}

/**
 * Uploads a local file to Google Drive and updates the database.
 */
export async function uploadToDrive(uuid, filePath, fileName, mimeType) {
    if (!IS_SYNC_ENABLED) {
        console.log(`ℹ️ Cloud sync is disabled. Skip upload for ${fileName}`);
        return null;
    }
    if (!FOLDER_ID) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

    try {
        console.log(`📤 Uploading ${fileName} to Google Drive...`);
        const fileMetadata = {
            name: fileName,
            parents: [FOLDER_ID],
        };
        const media = {
            mimeType: mimeType,
            body: fs.createReadStream(filePath),
        };

        const res = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webContentLink, modifiedTime, size',
        });

        const driveId = res.data.id;
        const size = res.data.size ? parseInt(res.data.size) : (await fs.stat(filePath)).size;

        db.prepare(`
            UPDATE files 
            SET drive_id = ?, url = ?, size = ?, last_modified = ?, cache_status = 'cached'
            WHERE uuid = ?
        `).run(driveId, res.data.webContentLink, size, res.data.modifiedTime, uuid);

        console.log(`✅ File uploaded to Drive: ${driveId}`);
        return driveId;
    } catch (error) {
        console.error('❌ Error uploading to Drive:', error.message);
        throw error;
    }
}
