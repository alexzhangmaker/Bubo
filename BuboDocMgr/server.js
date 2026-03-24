require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const db = require('./db');
const gdrive = require('./gdrive');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, 'uploads');

const { createLogger, loggingMiddleware } = require('../shared/logger');
const logger = createLogger('BuboDocMgr', __dirname);

// Middleware
app.use(cors());
app.use(express.json());
app.use(loggingMiddleware(logger));
app.use(express.static(path.join(__dirname, 'public')));

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.ensureDirSync(UPLOAD_DIR);
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Initialize DB
db.initDb().then(() => {
    console.log('Database initialized');
}).catch(err => {
    console.error('Database initialization failed:', err);
});

// API Routes

// GET /api/docs: List all documents metadata
app.get('/api/docs', async (req, res) => {
    try {
        const docs = await db.getAllDocs();
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/docs: Upload a new document
app.post('/api/docs', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const doc = {
            title: req.body.title || req.file.originalname,
            file_path: req.file.path,
            file_uri: `/api/docs/file/${path.basename(req.file.path)}`,
            file_type: req.file.mimetype,
            size: req.file.size
        };

        const id = await db.addDoc(doc);
        res.status(201).json({ id, ...doc });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/docs/:id: Get document metadata
app.get('/api/docs/:id', async (req, res) => {
    try {
        const doc = await db.getDocById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/docs/file/:filename: Download/Read doc file
app.get('/api/docs/file/:filename', (req, res) => {
    const filePath = path.join(UPLOAD_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// PUT /api/docs/:id: Update document metadata
app.put('/api/docs/:id', async (req, res) => {
    try {
        await db.updateDoc(req.params.id, req.body);
        res.json({ message: 'Document updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/docs/:id/notes: Update document notes
app.put('/api/docs/:id/notes', async (req, res) => {
    try {
        await db.updateNotes(req.params.id, req.body.notes);
        res.json({ message: 'Notes updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/docs/:id: Delete a document
app.delete('/api/docs/:id', async (req, res) => {
    try {
        const doc = await db.getDocById(req.params.id);
        if (doc) {
            if (fs.existsSync(doc.file_path)) {
                fs.unlinkSync(doc.file_path);
            }
            await db.deleteDoc(req.params.id);
            res.json({ message: 'Document deleted successfully' });
        } else {
            res.status(404).json({ error: 'Document not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/backup: Trigger backup to Google Drive
app.post('/api/backup', async (req, res) => {
    try {
        const docs = await db.getAllDocs();
        const results = [];
        
        for (const doc of docs) {
            if (fs.existsSync(doc.file_path)) {
                console.log(`Backing up ${doc.title}...`);
                const gdriveId = await gdrive.uploadFile(doc.file_path, doc.title, doc.file_type);
                await db.updateGDriveId(doc.id, gdriveId);
                results.push({ id: doc.id, title: doc.title, gdriveId });
            }
        }
        
        res.json({ message: 'Backup completed', results });
    } catch (err) {
        console.error('Backup failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/restore: Trigger restore from Google Drive
app.post('/api/restore', async (req, res) => {
    try {
        const backups = await gdrive.listBackups();
        const results = [];
        
        for (const file of backups) {
            const destPath = path.join(UPLOAD_DIR, file.name); // Simplified for demo
            console.log(`Restoring ${file.name}...`);
            await gdrive.downloadFile(file.id, destPath);
            
            // Re-index metadata if not exists
            const existingDocs = await db.getAllDocs();
            if (!existingDocs.find(d => d.title === file.name)) {
                const doc = {
                    title: file.name,
                    file_path: destPath,
                    file_uri: `/api/docs/file/${path.basename(destPath)}`,
                    file_type: 'application/octet-stream', // Fallback
                    size: fs.statSync(destPath).size
                };
                await db.addDoc(doc);
            }
            results.push({ title: file.name, status: 'restored' });
        }
        
        res.json({ message: 'Restore completed', results });
    } catch (err) {
        console.error('Restore failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`BuboDocMgr server running on http://localhost:${PORT}`);
});
