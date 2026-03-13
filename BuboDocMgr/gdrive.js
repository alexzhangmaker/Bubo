require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs-extra');

// Path to the service account key file
const KEY_FILE = process.env.GOOGLE_RESOURCES_KEY_FILE ? path.resolve(process.env.GOOGLE_RESOURCES_KEY_FILE) : path.join(__dirname, 'config', 'service-account.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function getDriveService() {
    if (!fs.existsSync(KEY_FILE)) {
        throw new Error(`Service account key file not found at ${KEY_FILE}. Please follow the instructions in implementation_plan.md.`);
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE,
        scopes: SCOPES,
    });

    const drive = google.drive({ version: 'v3', auth });
    return drive;
}

/**
 * Uploads a file to Google Drive.
 * @param {string} filePath - Local path to the file.
 * @param {string} fileName - Name to use for the file on Drive.
 * @param {string} mimeType - MIME type of the file.
 * @returns {Promise<string>} - The ID of the uploaded file on Drive.
 */
async function uploadFile(filePath, fileName, mimeType) {
    const drive = await getDriveService();
    const fileMetadata = {
        name: fileName,
    };
    const media = {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
    });

    return response.data.id;
}

/**
 * Downloads a file from Google Drive.
 * @param {string} fileId - The ID of the file on Drive.
 * @param {string} destPath - Local path where the file should be saved.
 */
async function downloadFile(fileId, destPath) {
    const drive = await getDriveService();
    const dest = fs.createWriteStream(destPath);
    
    const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
        response.data
            .on('end', () => {
                resolve();
            })
            .on('error', (err) => {
                reject(err);
            })
            .pipe(dest);
    });
}

/**
 * Lists backups (files uploaded by this service).
 */
async function listBackups() {
    const drive = await getDriveService();
    const response = await drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(id, name, createdTime)',
    });
    return response.data.files;
}

module.exports = {
    uploadFile,
    downloadFile,
    listBackups
};
