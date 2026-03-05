import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import db from './db.js';
import { syncMetadata, downloadAndCache } from './driveService.js';
import cron from 'node-cron';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// --- APIs ---

/**
 * GET /api/metadata
 * List all files' metadata from the database.
 */
app.get('/api/metadata', (req, res) => {
    try {
        const files = db.prepare('SELECT * FROM files ORDER BY name ASC').all();
        res.json(files);
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

// --- Scheduled Jobs ---

// Sync metadata every hour
cron.schedule('0 * * * *', () => {
    console.log('⏰ Scheduled sync starting...');
    syncMetadata();
});

// Initial sync on startup
syncMetadata();

app.listen(PORT, () => {
    console.log(`🚀 BuboCloudCache server running at http://localhost:${PORT}`);
});
