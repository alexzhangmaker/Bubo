const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3008; // Choose a port that doesn't conflict
const DB_PATH = path.join(__dirname, 'database.sqlite');

const { createLogger, loggingMiddleware } = require('../shared/logger');
const logger = createLogger('AccountingService', __dirname);

app.use(cors());
app.use(bodyParser.json());
app.use(loggingMiddleware(logger));
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
                currency TEXT,
                accountID TEXT,
                status TEXT DEFAULT '待提交'
            )`);

            // Alter table to add columns if they don't exist
            db.all("PRAGMA table_info(DealHistory)", (err, rows) => {
                if (err) return;
                const cols = rows.map(r => r.name);
                if (!cols.includes('accountID')) {
                    db.run("ALTER TABLE DealHistory ADD COLUMN accountID TEXT");
                }
                if (!cols.includes('status')) {
                    db.run("ALTER TABLE DealHistory ADD COLUMN status TEXT DEFAULT '待提交'");
                }
            });

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

            // OtherAssets Table
            db.run(`CREATE TABLE IF NOT EXISTS OtherAssets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assetName TEXT,
                assetCategory TEXT,
                currency TEXT,
                amount REAL,
                description TEXT,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // AccountBalances Table
            db.run(`CREATE TABLE IF NOT EXISTS AccountBalances (
                accountID TEXT,
                currency TEXT,
                cash REAL DEFAULT 0,
                liability REAL DEFAULT 0,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (accountID, currency)
            )`);
        });
    }
});

// --- API Endpoints for OtherAssets ---

// List all other assets
app.get('/api/other-assets', (req, res) => {
    db.all('SELECT * FROM OtherAssets', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create or update Other Asset
app.post('/api/other-assets', (req, res) => {
    const { id, assetName, assetCategory, currency, amount, description } = req.body;
    if (!id) {
        db.run(`INSERT INTO OtherAssets (assetName, assetCategory, currency, amount, description) VALUES (?, ?, ?, ?, ?)`,
        [assetName, assetCategory, currency, amount, description], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Other Asset created', id: this.lastID });
        });
    } else {
        db.run(`UPDATE OtherAssets SET assetName=?, assetCategory=?, currency=?, amount=?, description=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?`,
        [assetName, assetCategory, currency, amount, description, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Other Asset updated', changes: this.changes });
        });
    }
});

// Delete Other Asset
app.delete('/api/other-assets/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM OtherAssets WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Other Asset deleted', changes: this.changes });
    });
});

// Helper to adjust cash balance
function adjustCashBalance(accountID, currency, change, callback) {
    db.get('SELECT * FROM AccountBalances WHERE accountID = ? AND currency = ?', [accountID, currency], (err, row) => {
        if (err) return callback(err);
        if (row) {
            const newCash = row.cash + change;
            db.run('UPDATE AccountBalances SET cash = ?, updatedAt = CURRENT_TIMESTAMP WHERE accountID = ? AND currency = ?',
                [newCash, accountID, currency], callback);
        } else {
            db.run('INSERT INTO AccountBalances (accountID, currency, cash, liability, updatedAt) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
                [accountID, currency, change], callback);
        }
    });
}

// --- API Endpoints for AccountBalances ---

// List all account balances
app.get('/api/account-balances', (req, res) => {
    db.all('SELECT * FROM AccountBalances', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create or update account balance (cash/liability)
app.post('/api/account-balances', (req, res) => {
    const { accountID, currency, cash, liability } = req.body;
    if (!accountID || !currency) {
        return res.status(400).json({ error: 'accountID and currency are required' });
    }
    const sql = `INSERT INTO AccountBalances (accountID, currency, cash, liability, updatedAt) 
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) 
                 ON CONFLICT(accountID, currency) 
                 DO UPDATE SET cash=excluded.cash, liability=excluded.liability, updatedAt=CURRENT_TIMESTAMP`;
    db.run(sql, [accountID, currency, cash || 0, liability || 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Account balance updated' });
    });
});

// Delete account balance record
app.delete('/api/account-balances/:accountID/:currency', (req, res) => {
    const { accountID, currency } = req.params;
    db.run('DELETE FROM AccountBalances WHERE accountID = ? AND currency = ?', [accountID, currency], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Account balance deleted', changes: this.changes });
    });
});

// --- API Endpoint for Balance Sheet Calculation ---
app.get('/api/balance-sheet', async (req, res) => {
    try {
        const MKT_API = 'http://localhost:3009/api';

        // 1. Fetch assets and balances
        const assets = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM Assets', [], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });

        const balances = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM AccountBalances', [], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });

        // 2. Fetch market quotes from MktService
        let tickerQuoteMap = {};
        try {
            const mktRes = await fetch(`${MKT_API}/market`);
            if (mktRes.ok) {
                const mktData = await mktRes.json();
                mktData.forEach(item => {
                    tickerQuoteMap[item.ticker] = item.QuoteTTM;
                });
            }
        } catch (e) {
            console.error('[BalanceSheet] Failed to fetch market quotes:', e.message);
        }

        // 3. Gather unique currencies and fetch rates to CNY
        const uniqueCurrencies = new Set();
        assets.forEach(a => { if (a.currency) uniqueCurrencies.add(a.currency.toUpperCase()); });
        balances.forEach(b => { if (b.currency) uniqueCurrencies.add(b.currency.toUpperCase()); });
        
        const exRates = { 'CNY': 1 };
        for (const cur of uniqueCurrencies) {
            if (cur !== 'CNY') {
                try {
                    const exRes = await fetch(`${MKT_API}/exrate/${cur}/CNY`);
                    if (exRes.ok) {
                        const exData = await exRes.json();
                        exRates[cur] = exData.rate || 1;
                    } else {
                        exRates[cur] = 1;
                    }
                } catch (e) {
                    console.error(`[BalanceSheet] Failed to fetch exrate for ${cur}:`, e.message);
                    exRates[cur] = 1;
                }
            }
        }

        // 4. Compile balances and assets by accountID
        const accounts = {};

        const getAccount = (id) => {
            if (!accounts[id]) {
                accounts[id] = {
                    accountID: id,
                    cash: [],
                    securities: [],
                    liabilities: [],
                    totals: {
                        cashInCNY: 0,
                        securitiesCostInCNY: 0,
                        securitiesValueInCNY: 0,
                        assetsInCNY: 0,
                        liabilitiesInCNY: 0,
                        netAssetsInCNY: 0,
                        profitLossCNY: 0,
                        profitLossPercent: 0
                    }
                };
            }
            return accounts[id];
        };

        // Populate cash and liabilities
        balances.forEach(b => {
            const acc = getAccount(b.accountID);
            const cur = b.currency.toUpperCase();
            const exRate = exRates[cur] || 1;

            if (b.cash !== 0) {
                const cashInCNY = b.cash * exRate;
                acc.cash.push({
                    currency: cur,
                    amount: b.cash,
                    amountInCNY: cashInCNY,
                    exchangeRate: exRate
                });
                acc.totals.cashInCNY += cashInCNY;
            }

            if (b.liability !== 0) {
                const liabilityInCNY = b.liability * exRate;
                acc.liabilities.push({
                    currency: cur,
                    amount: b.liability,
                    amountInCNY: liabilityInCNY,
                    exchangeRate: exRate
                });
                acc.totals.liabilitiesInCNY += liabilityInCNY;
            }
        });

        // Populate securities
        assets.forEach(a => {
            if (a.shares === 0) return;
            const acc = getAccount(a.accountID);
            const cur = a.currency.toUpperCase();
            const exRate = exRates[cur] || 1;

            const costInCNY = a.shares * a.costPerShare * exRate;
            const marketPrice = tickerQuoteMap[a.ticker] !== undefined ? tickerQuoteMap[a.ticker] : a.costPerShare;
            const marketValue = a.shares * marketPrice;
            const marketValueInCNY = marketValue * exRate;

            acc.securities.push({
                ticker: a.ticker,
                assetType: a.assetType || '股票',
                currency: cur,
                shares: a.shares,
                costPerShare: a.costPerShare,
                totalCost: a.shares * a.costPerShare,
                totalCostInCNY: costInCNY,
                marketPrice,
                marketValue,
                marketValueInCNY,
                exchangeRate: exRate,
                profitLossCNY: marketValueInCNY - costInCNY,
                profitLossPercent: a.costPerShare > 0 ? ((marketPrice / a.costPerShare) - 1) * 100 : 0
            });

            acc.totals.securitiesCostInCNY += costInCNY;
            acc.totals.securitiesValueInCNY += marketValueInCNY;
        });

        // Calculate totals for each account
        for (const id in accounts) {
            const acc = accounts[id];
            acc.totals.assetsInCNY = acc.totals.cashInCNY + acc.totals.securitiesValueInCNY;
            acc.totals.netAssetsInCNY = acc.totals.assetsInCNY - acc.totals.liabilitiesInCNY;
            acc.totals.profitLossCNY = acc.totals.securitiesValueInCNY - acc.totals.securitiesCostInCNY;
            acc.totals.profitLossPercent = acc.totals.securitiesCostInCNY > 0 
                ? (acc.totals.securitiesValueInCNY / acc.totals.securitiesCostInCNY - 1) * 100 
                : 0;
        }

        // Consolidated totals
        const consolidated = {
            totalCashInCNY: 0,
            totalSecuritiesCostInCNY: 0,
            totalSecuritiesValueInCNY: 0,
            totalAssetsInCNY: 0,
            totalLiabilitiesInCNY: 0,
            netAssetsInCNY: 0,
            totalProfitLossCNY: 0,
            totalProfitLossPercent: 0
        };

        const accountList = Object.values(accounts);
        accountList.forEach(acc => {
            consolidated.totalCashInCNY += acc.totals.cashInCNY;
            consolidated.totalSecuritiesCostInCNY += acc.totals.securitiesCostInCNY;
            consolidated.totalSecuritiesValueInCNY += acc.totals.securitiesValueInCNY;
            consolidated.totalAssetsInCNY += acc.totals.assetsInCNY;
            consolidated.totalLiabilitiesInCNY += acc.totals.liabilitiesInCNY;
            consolidated.netAssetsInCNY += acc.totals.netAssetsInCNY;
        });

        consolidated.totalProfitLossCNY = consolidated.totalSecuritiesValueInCNY - consolidated.totalSecuritiesCostInCNY;
        consolidated.totalProfitLossPercent = consolidated.totalSecuritiesCostInCNY > 0 
            ? (consolidated.totalSecuritiesValueInCNY / consolidated.totalSecuritiesCostInCNY - 1) * 100 
            : 0;

        res.json({
            accounts: accountList,
            consolidated
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
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
    const { datetime, ticker, action, shares, price, currency, accountID } = req.body;
    const sql = `INSERT INTO DealHistory (datetime, ticker, action, shares, price, currency, accountID, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, '待提交')`;
    db.run(sql, [datetime || new Date().toISOString(), ticker, action, shares, price, currency, accountID], function(err) {
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

// Submit deal to update portfolio
app.post('/api/deals/:id/submit', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM DealHistory WHERE transactionID = ?', [id], (err, deal) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });
        if (deal.status !== '待提交') {
            return res.status(400).json({ error: `Cannot submit. Current status is ${deal.status}` });
        }

        db.get('SELECT * FROM Assets WHERE ticker = ? AND accountID = ?', [deal.ticker, deal.accountID], (err, asset) => {
            if (err) return res.status(500).json({ error: err.message });

            if (deal.action === 'buy') {
                const cashChange = - (deal.shares * deal.price);
                if (asset) {
                    // Weighted average cost formula
                    const newShares = asset.shares + deal.shares;
                    const newCost = ((asset.shares * asset.costPerShare) + (deal.shares * deal.price)) / newShares;
                    
                    db.run('UPDATE Assets SET shares = ?, costPerShare = ? WHERE ticker = ? AND accountID = ?',
                        [newShares, newCost, deal.ticker, deal.accountID],
                        (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            adjustCashBalance(deal.accountID, deal.currency, cashChange, (err) => {
                                if (err) console.error('[DealSubmit] Failed to adjust cash:', err.message);
                                db.run("UPDATE DealHistory SET status = '已提交' WHERE transactionID = ?", [id]);
                                res.json({ message: 'Deal submitted and added to existing asset' });
                            });
                        });
                } else {
                    // Insert new asset
                    db.run('INSERT INTO Assets (ticker, accountID, currency, shares, costPerShare, assetType) VALUES (?, ?, ?, ?, ?, ?)',
                        [deal.ticker, deal.accountID, deal.currency, deal.shares, deal.price, '股票'],
                        (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            adjustCashBalance(deal.accountID, deal.currency, cashChange, (err) => {
                                if (err) console.error('[DealSubmit] Failed to adjust cash:', err.message);
                                db.run("UPDATE DealHistory SET status = '已提交' WHERE transactionID = ?", [id]);
                                res.json({ message: 'Deal submitted and new asset created' });
                            });
                        });
                }
            } else if (deal.action === 'sell') {
                const cashChange = deal.shares * deal.price;
                if (!asset || asset.shares < deal.shares) {
                    // Reject: Suspicious transaction
                    db.run("UPDATE DealHistory SET status = '可疑' WHERE transactionID = ?", [id], (err) => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.status(400).json({ error: 'Transaction suspicious: Not enough shares or asset does not exist.' });
                    });
                } else {
                    // Update shares (keeping cost basis untouched for straightforward average tracking)
                    const newShares = asset.shares - deal.shares;
                    db.run('UPDATE Assets SET shares = ? WHERE ticker = ? AND accountID = ?', 
                        [newShares, deal.ticker, deal.accountID], 
                        (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            adjustCashBalance(deal.accountID, deal.currency, cashChange, (err) => {
                                if (err) console.error('[DealSubmit] Failed to adjust cash:', err.message);
                                db.run("UPDATE DealHistory SET status = '已提交' WHERE transactionID = ?", [id]);
                                res.json({ message: 'Deal submitted and shares deducted' });
                            });
                        });
                }
            }
        });
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

            // Step 2.5: Pre-fetch market data to avoid sequential fetches in loop
            let mktRes = await fetch(`${MKT_API}/market`);
            let mktData = await mktRes.json();
            const exRateCache = { 'CNY': 1 };

            // Step 3: Enrich each ticker with Market Data and Exchange Rates
            const updates = [];
            for (const item of rows) {
                try {
                    let tickerInfo = Array.isArray(mktData) ? mktData.find(m => m.ticker === item.ticker) : null;

                    // If ticker not found, fetch it on demand
                    if (!tickerInfo) {
                        console.log(`[Sync] Ticker ${item.ticker} missing. Fetching on demand...`);
                        const fetchReq = await fetch(`${MKT_API}/market/fetch/${item.ticker}`, { method: 'POST' });
                        if (fetchReq.ok) {
                            mktRes = await fetch(`${MKT_API}/market`);
                            mktData = await mktRes.json();
                            tickerInfo = Array.isArray(mktData) ? mktData.find(m => m.ticker === item.ticker) : null;
                        }
                    }

                    const quoteTTM = tickerInfo ? tickerInfo.QuoteTTM : 0;

                    // Get Exchange Rate to CNY
                    let exRate = 1;
                    if (item.currency && item.currency !== 'CNY') {
                        if (!exRateCache[item.currency]) {
                            try {
                                const exRes = await fetch(`${MKT_API}/exrate/${item.currency}/CNY`);
                                const exData = await exRes.json();
                                exRateCache[item.currency] = exData.rate || 1;
                            } catch (e) {
                                console.error(`[Sync] Failed to fetch exrate for ${item.currency}:`, e.message);
                                exRateCache[item.currency] = 1;
                            }
                        }
                        exRate = exRateCache[item.currency];
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
                        let stmtError = null;
                        updates.forEach(u => {
                            stmt.run([u.totalCostInCNY, u.exchangeRate, u.quoteTTM, u.earningInPercent, u.ticker], (err) => {
                                if (err) stmtError = err;
                            });
                        });
                        stmt.finalize((err) => {
                            if (err || stmtError) reject(err || stmtError);
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
        let stmtError = null;
        updates.forEach(u => {
            stmt.run([u.totalCostInCNY, u.exchangeRate, u.quoteTTM, u.earningInPercent, u.ticker], (err) => {
                if (err) stmtError = err;
            });
        });
        stmt.finalize((err) => {
            if (err || stmtError) return res.status(500).json({ error: (err || stmtError).message });
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
