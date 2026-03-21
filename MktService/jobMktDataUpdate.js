import cron from 'node-cron';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { API_FetchQuote } from './toolYFinance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'database.sqlite');
const API_URL = 'http://localhost:3009/api/market';

// Configurable thresholds for rate limiting
const CALLS_BEFORE_PAUSE = 10; // Pause after every 10 calls
const PAUSE_DURATION_MS = 30000; // Pause for 30 seconds

// Database instance
const db = new sqlite3.Database(DB_PATH);

async function getAllTickersWithInfo() {
    return new Promise((resolve, reject) => {
        db.all('SELECT ticker, assetType FROM SecuritiesInfo', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Get the latest update time from the MarketData table
async function getLastMarketUpdateTime() {
    return new Promise((resolve, reject) => {
        db.get('SELECT MAX(datetime) as lastTime FROM MarketData', [], (err, row) => {
            if (err) reject(err);
            else resolve(row && row.lastTime ? new Date(row.lastTime) : null);
        });
    });
}

async function updateMktData() {
    console.log(`[${new Date().toLocaleString()}] Starting MktData update job...`);
    try {
        const securities = await getAllTickersWithInfo();
        console.log(`Found ${securities.length} total securities to process.`);

        let processedAPI = 0;

        for (const security of securities) {
            const { ticker, assetType } = security;

            if (assetType && assetType.toLowerCase() === 'bond') {
                console.log(`Skipping Bond: ${ticker}`);
                continue;
            }

            try {
                if (processedAPI > 0 && processedAPI % CALLS_BEFORE_PAUSE === 0) {
                    console.log(`Reached threshold of ${CALLS_BEFORE_PAUSE} calls. Pausing for ${PAUSE_DURATION_MS / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, PAUSE_DURATION_MS));
                }

                console.log(`Fetching quote for ${ticker}...`);
                const quote = await API_FetchQuote(ticker);
                processedAPI++;
                
                const payload = {
                    ticker: ticker,
                    QuoteTTM: quote.price,
                    datetime: new Date().toISOString(),
                    change: quote.change,
                    changeInPercent: quote.percent
                };

                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    console.log(`Successfully updated ${ticker}`);
                } else {
                    console.error(`Failed to update ${ticker}: ${response.statusText}`);
                }
            } catch (err) {
                console.error(`Error processing ${ticker}:`, err.message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.log(`[${new Date().toLocaleString()}] MktData update job completed. Total API calls: ${processedAPI}`);
    } catch (err) {
        console.error('Job failed:', err.message);
    }
}

// Check if we missed the daily 7:00 AM run
async function checkAndRunIfMissed() {
    console.log('Checking for missed scheduled task...');
    try {
        const lastUpdate = await getLastMarketUpdateTime();
        const now = new Date();
        
        // Target 7:00 AM local time today
        const today7AM = new Date();
        today7AM.setHours(7, 0, 0, 0);

        // If current time is past 7:00 AM AND (we never updated OR last update was before today's 7:00 AM)
        if (now > today7AM && (!lastUpdate || lastUpdate < today7AM)) {
            console.log(`[CATCH-UP] Detected missed run. Last update: ${lastUpdate ? lastUpdate.toLocaleString() : 'Never'}. Running now...`);
            await updateMktData();
        } else {
            console.log('No catch-up needed. Next run scheduled for 07:00 AM.');
        }
    } catch (err) {
        console.error('Catch-up check failed:', err.message);
    }
}

// Schedule: 7:00 AM every day (Bangkok Time)
cron.schedule('0 7 * * *', () => {
    updateMktData();
}, {
    scheduled: true,
    timezone: "Asia/Bangkok"
});

console.log('MktData Update Job (v3) scheduled for 07:00 AM (Asia/Bangkok)');
console.log(`Rate limiting: Pause ${PAUSE_DURATION_MS/1000}s every ${CALLS_BEFORE_PAUSE} calls.`);

// Initial check on startup
checkAndRunIfMissed();
