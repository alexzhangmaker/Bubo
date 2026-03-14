const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const dispatcher = require('./dispatcher');

const app = express();
const PORT = process.env.PORT || 3303;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize DB and Start Dispatcher
db.initDb().then(() => {
    console.log('Database initialized');
    dispatcher.startDispatcher();
}).catch(err => {
    console.error('Initialization failed:', err);
});

// API Routes

// PostRequest: Queue a new request
app.post('/api/request', async (req, res) => {
    const { command, params } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Command is required' });
    }

    const uuid = uuidv4();
    try {
        await db.addRequest(uuid, command, params || {});
        res.json({ requestUUID: uuid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Execution Status
app.get('/api/status/:uuid', async (req, res) => {
    try {
        const request = await db.getRequest(req.params.uuid);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        res.json({ status: request.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch Result
app.get('/api/result/:uuid', async (req, res) => {
    try {
        const request = await db.getRequest(req.params.uuid);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        
        if (request.status === 'completed') {
            res.json({ status: 'completed', result: JSON.parse(request.result) });
        } else if (request.status === 'failed') {
            res.json({ status: 'failed', error: request.error });
        } else {
            res.json({ status: request.status });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Interfaces
app.get('/api/admin/requests', async (req, res) => {
    try {
        // Limited for performance
        const requests = await new Promise((resolve, reject) => {
            const sqlite3 = require('sqlite3');
            const dataDb = new sqlite3.Database(process.env.DB_FILE || './data/aiproxy.db');
            dataDb.all("SELECT * FROM requests ORDER BY created_at DESC LIMIT 50", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/commands', async (req, res) => {
    try {
        const commands = await db.getAllCommands();
        res.json(commands);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/commands', async (req, res) => {
    try {
        await db.saveCommand(req.body);
        res.json({ message: 'Command saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`BuboAIProxy server running on http://localhost:${PORT}`);
});
