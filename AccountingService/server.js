const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3008; // Choose a port that doesn't conflict
const DB_PATH = path.join(__dirname, 'database.sqlite');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Database initialization
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => {
            // Assets Table: ticker and accountID as composite primary key
            db.run(`CREATE TABLE IF NOT EXISTS Assets (
                ticker TEXT,
                accountID TEXT,
                currency TEXT,
                shares REAL,
                costPerShare REAL,
                assetType TEXT DEFAULT '股票',
                PRIMARY KEY (ticker, accountID)
            )`);

            // DealHistory Table: transactionID as primary key
            db.run(`CREATE TABLE IF NOT EXISTS DealHistory (
                transactionID INTEGER PRIMARY KEY AUTOINCREMENT,
                datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
                ticker TEXT,
                action TEXT,
                shares REAL,
                price REAL,
                currency TEXT
            )`);

            // PortfolioAggr Table
            db.run(`CREATE TABLE IF NOT EXISTS PortfolioAggr (
                ticker TEXT PRIMARY KEY,
                currency TEXT,
                shares REAL,
                costPerShare REAL,
                datetime DATETIME,
                totalCostInCNY REAL,
                exchangeRate REAL,
                quoteTTM REAL,
                earningInPercent REAL
            )`);
        });
    }
});

// --- API Endpoints for Assets ---

// List all assets
app.get('/api/assets', (req, res) => {
    db.all('SELECT * FROM Assets', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Upsert (Create or Update) Asset
app.post('/api/assets', (req, res) => {
    const { ticker, accountID, currency, shares, costPerShare, assetType } = req.body;
    const sql = `INSERT INTO Assets (ticker, accountID, currency, shares, costPerShare, assetType) 
                 VALUES (?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(ticker, accountID) 
                 DO UPDATE SET currency=excluded.currency, shares=excluded.shares, 
                               costPerShare=excluded.costPerShare, assetType=excluded.assetType`;
    db.run(sql, [ticker, accountID, currency, shares, costPerShare, assetType || '股票'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Asset updated', id: this.lastID });
    });
});

// Delete Asset
app.delete('/api/assets/:ticker/:accountID', (req, res) => {
    const { ticker, accountID } = req.params;
    db.run('DELETE FROM Assets WHERE ticker = ? AND accountID = ?', [ticker, accountID], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Asset deleted', changes: this.changes });
    });
});

// --- API Endpoints for DealHistory ---

// List all deals
app.get('/api/deals', (req, res) => {
    db.all('SELECT * FROM DealHistory ORDER BY datetime DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Add new deal
app.post('/api/deals', (req, res) => {
    const { datetime, ticker, action, shares, price, currency } = req.body;
    const sql = `INSERT INTO DealHistory (datetime, ticker, action, shares, price, currency) 
                 VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [datetime || new Date().toISOString(), ticker, action, shares, price, currency], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deal added', id: this.lastID });
    });
});

// Delete deal
app.delete('/api/deals/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM DealHistory WHERE transactionID = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deal deleted', changes: this.changes });
    });
});

// --- Portfolio Aggregation APIs ---

const requestStatus = new Map();

// POST /api/portfolio/aggregate - Asynchronously aggregate portfolio and enrich with market data
app.post('/api/portfolio/aggregate', (req, res) => {
    const requestId = Date.now().toString();
    requestStatus.set(requestId, { status: 'pending' });

    const MKT_API = 'http://localhost:3009/api';

    // Run full aggregation and enrichment in the background
    (async () => {
        try {
            // Step 1: SQL Aggregation
            const sqlAgg = `
                INSERT INTO PortfolioAggr (ticker, currency, shares, costPerShare, datetime)
                SELECT 
                    ticker, 
                    currency, 
                    SUM(shares) as totalShares,
                    SUM(shares * costPerShare) / SUM(shares) as weightedCost,
                    ? as datetime
                FROM Assets
                GROUP BY ticker, currency
                ON CONFLICT(ticker) DO UPDATE SET 
                    shares=excluded.shares, 
                    costPerShare=excluded.costPerShare, 
                    datetime=excluded.datetime
            `;
            const now = new Date().toISOString();
            
            await new Promise((resolve, reject) => {
                db.run(sqlAgg, [now], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Step 2: Fetch the newly aggregated data
            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT ticker, currency, shares, costPerShare FROM PortfolioAggr', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            // Step 3: Enrich each ticker with Market Data and Exchange Rates
            const updates = [];
            for (const item of rows) {
                try {
                    // Get Quote (Check MktService)
                    let mktRes = await fetch(`${MKT_API}/market`);
                    let mktData = await mktRes.json();
                    let tickerInfo = mktData.find(m => m.ticker === item.ticker);

                    // If ticker not found, fetch it on demand
                    if (!tickerInfo) {
                        console.log(`[Sync] Ticker ${item.ticker} missing. Fetching on demand...`);
                        const fetchReq = await fetch(`${MKT_API}/market/fetch/${item.ticker}`, { method: 'POST' });
                        if (fetchReq.ok) {
                            mktRes = await fetch(`${MKT_API}/market`);
                            mktData = await mktRes.json();
                            tickerInfo = mktData.find(m => m.ticker === item.ticker);
                        }
                    }

                    const quoteTTM = tickerInfo ? tickerInfo.QuoteTTM : 0;

                    // Get Exchange Rate to CNY
                    let exRate = 1;
                    if (item.currency !== 'CNY') {
                        const exRes = await fetch(`${MKT_API}/exrate/${item.currency}/CNY`);
                        const exData = await exRes.json();
                        exRate = exData.rate || 1;
                    }

                    // Calculations
                    const totalCostInCNY = item.shares * item.costPerShare * exRate;
                    const earningInPercent = item.costPerShare > 0 
                        ? ((quoteTTM / item.costPerShare) - 1) * 100 
                        : 0;

                    updates.push({
                        ticker: item.ticker,
                        totalCostInCNY,
                        exchangeRate: exRate,
                        quoteTTM,
                        earningInPercent
                    });
                } catch (enrichErr) {
                    console.error(`[Sync] Enrichment failed for ${item.ticker}:`, enrichErr.message);
                }
            }

            // Step 4: Bulk update the PortfolioAggr table
            if (updates.length > 0) {
                await new Promise((resolve, reject) => {
                    db.serialize(() => {
                        const stmt = db.prepare(`
                            UPDATE PortfolioAggr 
                            SET totalCostInCNY = ?, exchangeRate = ?, quoteTTM = ?, earningInPercent = ?
                            WHERE ticker = ?
                        `);
                        updates.forEach(u => {
                            stmt.run([u.totalCostInCNY, u.exchangeRate, u.quoteTTM, u.earningInPercent, u.ticker]);
                        });
                        stmt.finalize((err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                });
            }

            requestStatus.set(requestId, { status: 'completed' });
            console.log(`[Sync] Full portfolio aggregation completed for RequestID: ${requestId}`);

        } catch (err) {
            console.error('[Sync] Full Sync failed:', err.message);
            requestStatus.set(requestId, { status: 'failed', error: err.message });
        }
    })();

    res.json({ requestId });
});

// GET /api/portfolio/status/:id - Check aggregation status
app.get('/api/portfolio/status/:id', (req, res) => {
    const status = requestStatus.get(req.params.id);
    if (!status) return res.status(404).json({ error: 'Request ID not found' });
    res.json(status);
});

// GET /api/portfolio/data - Get all aggregated data
app.get('/api/portfolio/data', (req, res) => {
    db.all('SELECT * FROM PortfolioAggr', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST /api/portfolio/update - Bulk update portfolio metrics
app.post('/api/portfolio/update', (req, res) => {
    const updates = req.body; // Array of { ticker, totalCostInCNY, exchangeRate, quoteTTM, earningInPercent }
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Body must be an array' });

    db.serialize(() => {
        const stmt = db.prepare(`
            UPDATE PortfolioAggr 
            SET totalCostInCNY = ?, exchangeRate = ?, quoteTTM = ?, earningInPercent = ?
            WHERE ticker = ?
        `);
        updates.forEach(u => {
            stmt.run([u.totalCostInCNY, u.exchangeRate, u.quoteTTM, u.earningInPercent, u.ticker]);
        });
        stmt.finalize((err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Portfolio updated' });
        });
    });
});

// Serve console.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'console.html'));
});

app.listen(port, () => {
    console.log(`AccountingService listening at http://localhost:${port}`);
});
