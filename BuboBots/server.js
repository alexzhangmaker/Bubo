require('dotenv').config();
const express = require('express');
const cors = require('cors');
const googleChat = require('./google_chat_provider');
const telegram = require('./telegram_provider');
const db = require('./db');
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3304;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Providers, DB, and Scheduler
db.initDb().then(() => {
    console.log('[DB] Database initialized');
    if (process.env.ENABLE_GOOGLE_CHAT === 'true') {
        googleChat.init();
    }
    if (process.env.ENABLE_TELEGRAM_CHAT === 'true') {
        telegram.init();
    }
    scheduler.initScheduler();
}).catch(err => {
    console.error('[Init] Failed:', err);
});

// Webhook Endpoints
app.post('/webhooks/google-chat', async (req, res) => {
    if (process.env.ENABLE_GOOGLE_CHAT !== 'true') {
        return res.status(404).json({ error: 'Google Chat is disabled' });
    }
    try {
        const response = await googleChat.handleEvent(req.body);
        if (response) {
            res.json(response);
        } else {
            res.status(200).end();
        }
    } catch (err) {
        console.error('[GoogleChat] Webhook error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Maintenance & Schedule APIs
app.get('/api/schedules', async (req, res) => {
    try {
        const rows = await db.getSchedules();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/schedules', async (req, res) => {
    const { provider, target_id, message, cron_expression, is_function, fn_module, fn_name, fn_args } = req.body;
    try {
        const id = await db.addSchedule(provider, target_id, message, cron_expression, is_function, fn_module, fn_name, fn_args);
        await scheduler.reloadSchedules();
        res.json({ id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    try {
        await db.deleteSchedule(req.params.id);
        await scheduler.reloadSchedules();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Scan for available system tasks
app.get('/api/system-tasks', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const toolDir = path.join(__dirname, 'scheduleTool');
        
        // Ensure directory exists
        if (!fs.existsSync(toolDir)) {
            fs.mkdirSync(toolDir, { recursive: true });
        }
        
        const files = fs.readdirSync(toolDir).filter(f => f.endsWith('.js'));
        
        let tasks = [];
        for (const file of files) {
            const modulePath = path.join(toolDir, file);
            let mod;
            try {
                mod = await import(`file://${modulePath}`);
            } catch (e) {
                mod = require(modulePath);
            }
            
            if (typeof mod.getTaskFunction === 'function') {
                tasks.push({
                    module: file,
                    name: 'getTaskFunction'
                });
            }
        }
        res.json(tasks);
    } catch (err) {
        console.error('Error scanning system tasks:', err);
        res.status(500).json({ error: 'Failed to scan system tasks' });
    }
});

// Ticker Track APIs
app.get('/api/tickers', async (req, res) => {
    try {
        const rows = await db.getTickers();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickers', async (req, res) => {
    const { ticker, quoteMax, quoteMin } = req.body;
    try {
        const id = await db.addTicker(ticker, quoteMax || null, quoteMin || null);
        res.json({ id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tickers/:id', async (req, res) => {
    try {
        await db.deleteTicker(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'BuboBots' });
});

app.listen(PORT, () => {
    console.log(`BuboBots server running on http://localhost:${PORT}`);
    console.log(`Google Chat Webhook: http://localhost:${PORT}/webhooks/google-chat`);
});
