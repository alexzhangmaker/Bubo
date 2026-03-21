import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { API_FetchQuote, API_FetchExRate } from './toolYFinance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3009;
const DB_PATH = path.join(__dirname, 'database.sqlite');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database (MktService - ESM).');
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS MarketData (
                ticker TEXT PRIMARY KEY,
                QuoteTTM REAL,
                datetime DATETIME,
                changeInPercent REAL,
                change REAL
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS SecuritiesInfo (
                ticker TEXT PRIMARY KEY,
                companyName TEXT,
                listingCountry TEXT,
                currency TEXT,
                assetType TEXT,
                tags TEXT
            )`);
        });
    }
});

// --- API Endpoints ---
app.get('/api/market', (req, res) => {
    db.all('SELECT * FROM MarketData', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/market', (req, res) => {
    const { ticker, QuoteTTM, datetime, changeInPercent, change } = req.body;
    const sql = `INSERT INTO MarketData (ticker, QuoteTTM, datetime, changeInPercent, change) 
                 VALUES (?, ?, ?, ?, ?) 
                 ON CONFLICT(ticker) 
                 DO UPDATE SET QuoteTTM=excluded.QuoteTTM, datetime=excluded.datetime, 
                               changeInPercent=excluded.changeInPercent, change=excluded.change`;
    db.run(sql, [ticker, QuoteTTM, datetime || new Date().toISOString(), changeInPercent, change], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Market data updated', id: this.lastID });
    });
});

app.delete('/api/market/:ticker', (req, res) => {
    const { ticker } = req.params;
    db.run('DELETE FROM MarketData WHERE ticker = ?', [ticker], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Market data deleted', changes: this.changes });
    });
});

app.get('/api/securities', (req, res) => {
    db.all('SELECT * FROM SecuritiesInfo', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/securities', (req, res) => {
    let { ticker, companyName, listingCountry, currency, assetType, tags } = req.body;
    if (Array.isArray(tags)) tags = JSON.stringify(tags);
    const sql = `INSERT INTO SecuritiesInfo (ticker, companyName, listingCountry, currency, assetType, tags) 
                 VALUES (?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(ticker) 
                 DO UPDATE SET companyName=excluded.companyName, listingCountry=excluded.listingCountry, 
                               currency=excluded.currency, assetType=excluded.assetType, tags=excluded.tags`;
    db.run(sql, [ticker, companyName, listingCountry, currency, assetType, tags], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Securities info updated', id: this.lastID });
    });
});

app.delete('/api/securities/:ticker', (req, res) => {
    const { ticker } = req.params;
    db.run('DELETE FROM SecuritiesInfo WHERE ticker = ?', [ticker], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Securities info deleted', changes: this.changes });
    });
});

// Exchange Rate API
app.get('/api/exrate/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    try {
        const rate = await API_FetchExRate(from, to);
        res.json({ from, to, rate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch on demand API
app.post('/api/market/fetch/:ticker', async (req, res) => {
    const { ticker } = req.params;
    try {
        const quote = await API_FetchQuote(ticker);
        const datetime = new Date().toISOString();
        const sql = `INSERT INTO MarketData (ticker, QuoteTTM, datetime, changeInPercent, change) 
                     VALUES (?, ?, ?, ?, ?) 
                     ON CONFLICT(ticker) 
                     DO UPDATE SET QuoteTTM=excluded.QuoteTTM, datetime=excluded.datetime, 
                                   changeInPercent=excluded.changeInPercent, change=excluded.change`;
        db.run(sql, [ticker, quote.price, datetime, quote.percent, quote.change], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Market data fetched and updated', ticker });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Refresh all tickers API
app.post('/api/market/refresh-all', (req, res) => {
    db.all('SELECT ticker FROM MarketData', [], async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const tickers = rows.map(r => r.ticker);
        console.log(`Manual refresh started for ${tickers.length} tickers`);
        
        // Return immediately to avoid UI hang
        res.json({ message: 'Refresh started in background', count: tickers.length });

        for (const ticker of tickers) {
            try {
                const quote = await API_FetchQuote(ticker);
                const datetime = new Date().toISOString();
                const sql = `UPDATE MarketData SET QuoteTTM=?, datetime=?, changeInPercent=?, change=? WHERE ticker=?`;
                db.run(sql, [quote.price, datetime, quote.percent, quote.change, ticker]);
                await new Promise(r => setTimeout(r, 1000)); // Rate limit: 1s
            } catch (e) {
                console.error(`Manual refresh failed for ${ticker}:`, e.message);
            }
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'console.html'));
});

app.listen(port, () => {
    console.log(`MktService (ESM) listening at http://localhost:${port}`);
});
