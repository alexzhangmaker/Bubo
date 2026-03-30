import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import db from './db.js';
import { syncMetadata, downloadAndCache, uploadToDrive, deleteFromDrive, updateOnDrive } from './driveService.js';
import cron from 'node-cron';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createLogger, loggingMiddleware } = require('../shared/logger');
const logger = createLogger('BuboMemoMgr', __dirname);

const app = express();
const PORT = process.env.PORT || 3001;
const CACHE_DIR = process.env.CACHE_DIR || './cache';

app.use(helmet({
    contentSecurityPolicy: false, // For local dev and console.html simplicity
}));
app.use(cors());
app.use(loggingMiddleware(logger));
app.use(express.json());
app.use(express.static('public'));

// Configure Multer for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, CACHE_DIR);
    },
    filename: (req, file, cb) => {
        const uuid = uuidv4();
        req.generatedUuid = uuid;
        cb(null, `${uuid}_${file.originalname}`);
    }
});
const upload = multer({ storage });

// --- APIs ---

/**
 * GET /api/metadata
 * List all files' metadata from the database.
 */
app.get('/api/metadata', (req, res) => {
    try {
        const files = db.prepare(`
            SELECT 
                f.*, 
                m.title as memo_title, 
                m.tags as memo_tags, 
                m.uuid as memo_uuid,
                m.project_id,
                p.name as project_name
            FROM files f
            LEFT JOIN memos m ON f.uuid = m.content_uuid
            LEFT JOIN projects p ON m.project_id = p.id
            ORDER BY m.created_at DESC
        `).all();
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/file
 * Upload a new file.
 */
app.post('/api/file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const uuid = req.generatedUuid;
        // Fix for Chinese characters: multer parses originalname as Latin1.
        // Convert it back to UTF-8.
        const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf-8');
        const mimeType = req.file.mimetype;
        const size = req.file.size;
        const cachePath = req.file.path;

        // Metadata from potential form fields (e.g. from ext.AIHelper)
        const title = req.body.title || fileName;
        const tags = req.body.tags || '';

        // 1. Save to SQLite: files table
        db.prepare(`
            INSERT INTO files (uuid, name, mime_type, size, cache_path, cache_status)
            VALUES (?, ?, ?, ?, ?, 'cached')
        `).run(uuid, fileName, mimeType, size, cachePath);

        // 2. Create entry in memos table linked to this file
        const memoUuid = uuidv4();
        const projectId = req.body.project_id || null;
        db.prepare(`
            INSERT INTO memos (uuid, title, tags, content_uuid, project_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(memoUuid, title, tags, uuid, projectId);

        // 3. Upload to Drive (async)
        uploadToDrive(uuid, cachePath, fileName, mimeType).catch(console.error);

        res.status(201).json({ uuid, memoUuid, message: 'Memo and file created' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/file/:uuid
 * Remove file from local cache (metadata stays unless specified).
 */
app.delete('/api/file/:uuid', async (req, res) => {
    try {
        const file = db.prepare('SELECT * FROM files WHERE uuid = ?').get(req.params.uuid);
        if (!file) return res.status(404).json({ error: 'File not found' });

        if (file.cache_path && await fs.exists(file.cache_path)) {
            await fs.remove(file.cache_path);
        }

        db.prepare("UPDATE files SET cache_path = NULL, cache_status = 'pending' WHERE uuid = ?").run(req.params.uuid);
        res.json({ message: 'Local cache cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/card/:uuid
 * Permanently delete a file (and its linked memo) from DB, disk, and Drive.
 */
app.delete('/api/card/:uuid', async (req, res) => {
    try {
        const file = db.prepare('SELECT * FROM files WHERE uuid = ?').get(req.params.uuid);
        if (!file) return res.status(404).json({ error: 'File not found' });
        
        // 1. Delete from Drive
        if (file.drive_id) {
            try {
                await deleteFromDrive(file.drive_id);
            } catch(e) {
                console.error('Failed to trash on drive', e);
            }
        }

        // 2. Clear local cache
        if (file.cache_path && await fs.exists(file.cache_path)) {
            await fs.remove(file.cache_path);
        }

        // 3. Delete from SQLite
        db.prepare('DELETE FROM memos WHERE content_uuid = ?').run(file.uuid);
        db.prepare('DELETE FROM files WHERE uuid = ?').run(file.uuid);

        res.json({ message: 'Card completely deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/memo/:uuid
 * Update memo metadata (title, tags, project_id).
 */
app.put('/api/memo/:uuid', (req, res) => {
    try {
        const { title, tags, project_id } = req.body;
        const uuid = req.params.uuid;
        
        const updates = [];
        const params = [];
        
        if (title !== undefined) { updates.push('title = ?'); params.push(title); }
        if (tags !== undefined) { updates.push('tags = ?'); params.push(tags); }
        if (project_id !== undefined) { updates.push('project_id = ?'); params.push(project_id); }
        
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        
        params.push(uuid, uuid);
        const sql = `UPDATE memos SET ${updates.join(', ')}, last_update = CURRENT_TIMESTAMP WHERE uuid = ? OR content_uuid = ?`;
        const result = db.prepare(sql).run(...params);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Memo not found' });
        }
        
        res.json({ message: 'Memo updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cache/clear
 * Clear all local cached files.
 */
app.post('/api/cache/clear', async (req, res) => {
    try {
        const filenames = await fs.readdir(CACHE_DIR);
        for (const filename of filenames) {
            await fs.remove(path.join(CACHE_DIR, filename));
        }
        db.prepare("UPDATE files SET cache_path = NULL, cache_status = 'pending'").run();
        res.json({ message: 'All local cache cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/system/status
 * Get system status.
 */
app.get('/api/system/status', async (req, res) => {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_files,
                SUM(CASE WHEN cache_status = 'cached' THEN 1 ELSE 0 END) as cached_files,
                SUM(size) as total_size
            FROM files
        `).get();

        const diskUsage = await fs.readdir(CACHE_DIR).then(files => files.length);

        res.json({
            ...stats,
            disk_files_count: diskUsage,
            db_path: process.env.DB_FILE || './metadata.db',
            cache_dir: CACHE_DIR
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/file/:uuid
 * Get metadata for a specific file.
 */
app.get('/api/file/:uuid', (req, res) => {
    try {
        const file = db.prepare('SELECT * FROM files WHERE uuid = ?').get(req.params.uuid);
        if (!file) return res.status(404).json({ error: 'File not found' });
        res.json(file);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/file/:uuid/content
 * Stream file content. Download from Drive if not cached.
 */
app.get('/api/file/:uuid/content', async (req, res) => {
    try {
        const filePath = await downloadAndCache(req.params.uuid);
        res.sendFile(filePath, { root: '.' });
    } catch (error) {
        if (error.message === 'File not found in database') {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

/**
 * PUT /api/file/:uuid/content
 * Update file content.
 */
app.put('/api/file/:uuid/content', async (req, res) => {
    try {
        const { content } = req.body;
        const uuid = req.params.uuid;
        
        const file = db.prepare('SELECT * FROM files WHERE uuid = ?').get(uuid);
        if (!file) return res.status(404).json({ error: 'File not found' });
        
        // Use existing cache path or generate one
        const fileName = file.name;
        const cachePath = file.cache_path || path.join(CACHE_DIR, `${uuid}_${fileName}`);
        
        // Write content to local cache
        await fs.writeFile(cachePath, content);
        
        // Update database
        db.prepare("UPDATE files SET cache_path = ?, cache_status = 'cached' WHERE uuid = ?").run(cachePath, uuid);
        
        // Update on Drive
        if (file.drive_id) {
            updateOnDrive(file.drive_id, cachePath, file.mime_type).catch(console.error);
        }
        
        res.json({ message: 'Content updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/sync
 * Manually trigger metadata sync.
 */
app.post('/api/sync', async (req, res) => {
    try {
        await syncMetadata();
        res.json({ message: 'Sync complete' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * --- Project Management APIs ---
 */

app.get('/api/projects', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM projects ORDER BY is_archived ASC, display_order ASC, name ASC').all();
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/projects', (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Project name is required' });
        
        const result = db.prepare('INSERT INTO projects (name, description) VALUES (?, ?)').run(name, description);
        res.status(201).json({ id: result.lastInsertRowid, message: 'Project created' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/projects/:id', (req, res) => {
    try {
        const { name, description, is_archived, display_order } = req.body;
        const id = req.params.id;
        
        const updates = [];
        const params = [];
        
        if (name !== undefined) { updates.push('name = ?'); params.push(name); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (is_archived !== undefined) { updates.push('is_archived = ?'); params.push(is_archived); }
        if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
        
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        
        params.push(id);
        const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...params);
        
        res.json({ message: 'Project updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/projects/reorder', (req, res) => {
    try {
        const { orders } = req.body; // Array of {id, display_order}
        if (!Array.isArray(orders)) return res.status(400).json({ error: 'Invalid orders' });
        
        const update = db.prepare('UPDATE projects SET display_order = ? WHERE id = ?');
        const transaction = db.transaction((items) => {
            for (const item of items) {
                update.run(item.display_order, item.id);
            }
        });
        
        transaction(orders);
        res.json({ message: 'Projects reordered' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/projects/:id', (req, res) => {
    try {
        const id = req.params.id;
        const usage = db.prepare('SELECT COUNT(*) as count FROM memos WHERE project_id = ?').get(id);
        if (usage.count > 0) return res.status(400).json({ error: 'Cannot delete project with existing cards' });
        
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        res.json({ message: 'Project deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Scheduled Jobs ---

// Sync metadata every hour
cron.schedule('0 * * * *', () => {
    console.log('⏰ Scheduled sync starting...');
    syncMetadata();
});

// Initial sync on startup
syncMetadata();

app.listen(PORT, () => {
    console.log(`🚀 BuboMemoMgr server running at http://localhost:${PORT}`);
});
