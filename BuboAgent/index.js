import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Workflow, createStep } from '@mastra/core/workflows';
import admin from 'firebase-admin';
import * as xlsx from 'xlsx';
import { google } from 'googleapis';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { API_FetchQuote, API_FetchStockMeta, API_FetchExRate } from './toolYFinance.js';

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Prevents the process from crashing on transient connection drops
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (err.message.includes('ECONNRESET')) {
        console.log('Transient network error (ECONNRESET) caught. Continuing...');
        return;
    }
    // For critical errors other than network drops, we might want to exit
    // process.exit(1); 
});

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Initialize SQLite
const db = new Database('bubo_agent.db');
db.exec('CREATE TABLE IF NOT EXISTS memory (id TEXT PRIMARY KEY, content TEXT)');
db.exec('CREATE TABLE IF NOT EXISTS collected_urls (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT, title TEXT, description TEXT, image TEXT, collection_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS collections (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, color TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT, side TEXT, quantity REAL, price REAL, currency TEXT, raw_text TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, event_date TEXT, description TEXT, raw_text TEXT, telegram_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE, username TEXT UNIQUE, first_name TEXT, last_name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');

// Migration: Update collected_urls if it's the old schema
try {
    db.exec('ALTER TABLE collected_urls ADD COLUMN title TEXT');
} catch (e) { }
try {
    db.exec('ALTER TABLE collected_urls ADD COLUMN description TEXT');
} catch (e) { }
try {
    db.exec('ALTER TABLE collected_urls ADD COLUMN image TEXT');
} catch (e) { }
try {
    db.exec('ALTER TABLE collected_urls ADD COLUMN collection_id INTEGER');
} catch (e) { }

// Migration: Add telegram_id to reminders if it doesn't exist
try {
    db.exec('ALTER TABLE reminders ADD COLUMN telegram_id TEXT');
} catch (e) {
    // Column already exists or table doesn't exist yet (handled by CREATE TABLE above)
}


// 2. Initialize Firebase
if (process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

const rtdb = admin.database();

// 3. Initialize Google Services (using Service Account for Drive & Sheets)
const googleAuth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL?.trim(),
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
    ]
});

const drive = google.drive({ version: 'v3', auth: googleAuth });
const sheets = google.sheets({ version: 'v4', auth: googleAuth });

// 4. Initialize Mastra Agent
const buboAgent = new Agent({
    name: 'BuboAgent',
    instructions: `You are a helpful data assistant. 
    - For Google Sheets: If you have data and a Sheet Name/ID, call appendGoogleSheet immediately.
    - For Stocks/Finance: If the user asks about stock prices, tickers, or exchange rates, call fetchFinanceInfo. Use the symbol/ticker (like AAPL or 700.HK) as a parameter.
    - For Trades: If the user asks to see recent trades or transaction history, call listRecentTrades.
    - For Reminders: If the user wants to set a reminder or schedule an event (e.g., "March 15th Microsoft Earnings"), call addReminder.
      You MUST extract the date and description from the message. 
      If a context like user_tg_id=123456 is provided, pass that 123456 to the "telegram_id" field.
      Also pass the full original message to the "raw_text" field.
    - BE PROACTIVE: Call tools directly without asking for permission or explaining.
    - RESPONSE STYLE: Keep your final response very short (e.g., "OK. I've set that reminder for you.").`,
    model: 'google/gemini-2.0-flash', // Keep this or try 'google/gemini-1.5-flash' if it persists
    tools: {
        addReminder: {
            label: 'Add Reminder',
            description: 'Schedule a reminder or event. Input can be natural language like "2026-03-15 Microsoft Q1".',
            input: z.object({
                date: z.string().describe('The date of the event (YYYY-MM-DD or readable string)'),
                description: z.string().describe('What the reminder is about'),
                telegram_id: z.string().optional().describe('The Telegram user ID to notify'),
                raw_text: z.string().optional().describe('The full original prompt from the user')
            }),
            execute: async (args) => {
                const input = args?.input || args;
                console.log('🤖 BuboAgent: Reminder Parsing Start. Raw Input:', JSON.stringify(input));

                let finalDate = null;
                let finalDesc = null;
                let finalRaw = '';
                let finalTgId = null;

                // --- Robust Parsing Loop ---
                for (const [key, value] of Object.entries(input)) {
                    if (!value) continue;
                    const k = key.toLowerCase();
                    const v = String(value);

                    if (k.includes('date') || k.includes('time') || k.includes('when')) {
                        finalDate = v;
                    } else if (k.includes('desc') || k.includes('event') || k.includes('what') || k.includes('content')) {
                        finalDesc = v;
                    } else if (k.includes('raw') || k.includes('text') || k.includes('input')) {
                        finalRaw = v;
                    } else if (k.includes('tg') || k.includes('telegram') || k.includes('chat') || k.includes('id')) {
                        finalTgId = v;
                    }
                }

                // Fallback: If we only got strings and don't know which is which
                if (!finalDate || !finalDesc) {
                    const values = Object.values(input).filter(v => typeof v === 'string' && v !== finalTgId && v !== finalRaw);
                    // If we have at least one string, use it for whatever is missing
                    if (values.length > 0) {
                        if (!finalDate) finalDate = 'Pending';
                        if (!finalDesc) finalDesc = values[0];
                    }
                }

                // Ultimate fallback: if everything is still null, use the raw text
                if (!finalDesc) finalDesc = finalRaw || 'Untitled Event';
                if (!finalDate) finalDate = 'TBD';

                try {
                    const stmt = db.prepare('INSERT INTO reminders (event_date, description, raw_text, telegram_id) VALUES (?, ?, ?, ?)');
                    const info = stmt.run(finalDate, finalDesc, finalRaw || '', finalTgId);
                    console.log(`✅ Reminder Saved: ${finalDate} | ${finalDesc} | TG: ${finalTgId}`);
                    return `✅ Reminder set: ${finalDate} - ${finalDesc} (ID: ${info.lastInsertRowid})`;
                } catch (err) {
                    console.error('❌ Database Error (Reminder):', err.message);
                    return `Error saving reminder: ${err.message}`;
                }
            }
        },
        readFirebase: {
            label: 'Read Firebase',
            description: 'Read from Firebase path',
            input: z.object({ path: z.string() }),
            execute: async (args) => {
                const input = args?.input || args;
                const snapshot = await rtdb.ref(input.path).once('value');
                return snapshot.val();
            }
        },
        readExcel: {
            label: 'Read Excel',
            description: 'Read Excel file',
            input: z.object({ filePath: z.string() }),
            execute: async (args) => {
                const input = args?.input || args;
                const workbook = xlsx.readFile(input.filePath);
                return xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            }
        },
        listDriveFiles: {
            label: 'List Drive Files',
            description: 'List files in Drive',
            execute: async () => {
                const res = await drive.files.list({ pageSize: 10 });
                return res.data.files || [];
            }
        },
        appendGoogleSheet: {
            label: 'Append to Google Sheet',
            description: 'Append data to a Google Sheet. Supports Name, ID, or sentences containing them.',
            input: z.object({
                spreadsheetName: z.string().optional().describe('Doc name or string containing ID'),
                spreadsheetId: z.string().optional().describe('Direct ID'),
                sheetId: z.string().optional().describe('Direct ID'),
                sheet_id: z.string().optional().describe('Direct ID'),
                range: z.string().optional().describe('Tab name (default: Sheet1)'),
                values: z.array(z.string()).optional().describe('Data array'),
                data: z.array(z.string()).optional().describe('Data array'),
                row: z.string().optional().describe('Data as string (comma separated)')
            }),
            execute: async (args) => {
                const input = args?.input || args;
                console.log('🤖 BuboAgent: Robust Parsing Start. Raw Input:', JSON.stringify(input));

                let targetId = null;
                let finalValues = null;
                let targetRange = 'Sheet1!A1';

                // --- 1. Aggressive Extraction Loop ---
                // We scan EVERY key the LLM sent to find what we need
                for (const [key, value] of Object.entries(input)) {
                    if (!value) continue;

                    // A. Look for Spreadsheet ID (any string matching the pattern)
                    if (typeof value === 'string') {
                        const idMatch = value.match(/[a-zA-Z0-9-_]{25,}/);
                        if (idMatch && !targetId) {
                            targetId = idMatch[0];
                            console.log(`🔍 Found ID in field "${key}": ${targetId}`);
                        }

                        // B. Look for dynamic range/tab name
                        if (key.toLowerCase().includes('range') || key.toLowerCase().includes('sheet')) {
                            if (value.includes('!') || value.startsWith('Sheet')) {
                                targetRange = value;
                            }
                        }
                    }

                    // C. Look for Rows/Values (arrays or comma-strings)
                    if (Array.isArray(value) && value.length > 0) {
                        // Priority to the first array found that looks like data
                        if (!finalValues) finalValues = value;
                    } else if (typeof value === 'string' && value.includes(',')) {
                        // Fallback: if it's a comma string and we don't have an ID-like string yet
                        const parts = value.split(/[,，]/).map(v => v.trim());
                        if (parts.length >= 2 && !finalValues) {
                            finalValues = parts;
                        }
                    }
                }

                // --- 2. Fallback: If still no ID, try searching by name using any string field ---
                if (!targetId) {
                    for (const [key, value] of Object.entries(input)) {
                        if (typeof value === 'string' && value.length > 3 && value.length < 50) {
                            console.log(`Attempting to search file by name: ${value}`);
                            const res = await drive.files.list({
                                q: `name = '${value}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
                            });
                            targetId = res.data.files?.[0]?.id;
                            if (targetId) break;
                        }
                    }
                }

                if (!targetId) return 'Error: Could not find a valid Spreadsheet ID or Name in your request.';
                if (!finalValues) return 'Error: Could not extract any data rows to write.';

                try {
                    console.log(`🚀 Executing Append: ID=${targetId}, Range=${targetRange}, Data=[${finalValues}]`);
                    const result = await sheets.spreadsheets.values.append({
                        spreadsheetId: targetId,
                        range: targetRange,
                        valueInputOption: 'USER_ENTERED',
                        insertDataOption: 'INSERT_ROWS',
                        requestBody: { values: [finalValues] }
                    });

                    return `✅ Success! Added to "${targetId}" (${targetRange}). New range: ${result.data.updates?.updatedRange}`;
                } catch (err) {
                    console.error('❌ Google Sheets API Error:', err.message);
                    return `Google Sheets Error: ${err.message}`;
                }
            }
        },
        fetchFinanceInfo: {
            label: 'Fetch Finance Info',
            description: 'Get stock quotes, metadata, or exchange rates.',
            input: z.object({
                symbol: z.string().optional().describe('The stock symbol (e.g., AAPL)'),
                type: z.enum(['quote', 'meta', 'exchange']).optional().describe('Type of info')
            }),
            execute: async (args) => {
                const input = args?.input || args;
                console.log('🤖 BuboAgent: Finance Parsing Start. Raw Input:', JSON.stringify(input));

                let symbol = null;
                let type = 'quote'; // Default

                // --- Omni-Parsing Loop ---
                for (const [key, value] of Object.entries(input)) {
                    if (!value || typeof value !== 'string') continue;

                    const k = key.toLowerCase();
                    const v = value.toLowerCase();

                    // Detect Type
                    if (k.includes('type')) {
                        if (v.includes('meta')) type = 'meta';
                        else if (v.includes('ex')) type = 'exchange';
                        else type = 'quote';
                    }
                    // Detect Symbol (if not already found or if this key looks more specific)
                    else if (k.includes('symbol') || k.includes('ticker') || k.includes('stock') || k.includes('code') || k.includes('currency')) {
                        symbol = value.toUpperCase();
                    }
                    // Fallback: any 2-10 char uppercase-ish string or currency pair
                    else if (!symbol && value.length >= 2 && value.length <= 15) {
                        symbol = value.toUpperCase();
                    }
                }

                if (!symbol) return 'Error: Could not identify the stock symbol or ticker in your request.';

                try {
                    console.log(`🚀 Executing Finance Tool: Symbol=${symbol}, Type=${type}`);
                    if (type === 'meta') {
                        const data = await API_FetchStockMeta(symbol);
                        return JSON.stringify(data, null, 2);
                    } else if (type === 'exchange') {
                        const parts = symbol.split(/[,/， ]/).filter(p => p.length > 0);
                        const from = parts[0];
                        const to = parts[1] || 'USD';
                        const rate = await API_FetchExRate(from, to);
                        return `Exchange Rate ${from}/${to}: ${rate}`;
                    } else {
                        const quote = await API_FetchQuote(symbol);
                        return `Current price for ${quote.symbol}: ${quote.price} ${quote.currency} (Change: ${quote.change} / ${quote.percent}%)`;
                    }
                } catch (err) {
                    console.error('❌ Finance API Error:', err.message);
                    return `Error fetching finance data for ${symbol}: ${err.message}`;
                }
            }
        },
        listRecentTrades: {
            label: 'List Recent Trades',
            description: 'List the most recent trades recorded in the system.',
            input: z.object({
                limit: z.number().optional().default(5).describe('Number of trades to list')
            }),
            execute: async (args) => {
                const input = args?.input || args;
                const limit = input.limit || 5;
                try {
                    const stmt = db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?');
                    const trades = stmt.all(limit);
                    if (trades.length === 0) return 'No trades found in the database.';

                    let response = `Found ${trades.length} recent trades:\n`;
                    trades.forEach((t, i) => {
                        response += `${i + 1}. ${t.created_at}: ${t.side} ${t.quantity} ${t.symbol} @ ${t.price} ${t.currency}\n`;
                    });
                    return response;
                } catch (err) {
                    return `Error fetching trades: ${err.message}`;
                }
            }
        }
    }
});

// --- 4.5 Trade Workflow ---
const TradeSchema = z.object({
    symbol: z.string(),
    side: z.enum(['BUY', 'SELL']),
    quantity: z.number(),
    price: z.number(),
    currency: z.string().default('USD')
});

const parseTradeStep = createStep({
    id: 'parseTrade',
    inputSchema: z.object({ text: z.string() }),
    outputSchema: TradeSchema,
    execute: async ({ inputData, mastra }) => {
        const agent = mastra.getAgent('bubo');
        const prompt = `Extract trade details from this text: "${inputData.text}". 
        Return ONLY a JSON object with: symbol, side (BUY/SELL), quantity (number), price (number), currency (default USD).
        Example: "Bought 10 AAPL at 150" -> {"symbol": "AAPL", "side": "BUY", "quantity": 10, "price": 150, "currency": "USD"}`;

        console.log('🤖 Workflow Agent Prompting...');
        const result = await agent.generate(prompt, {
            output: TradeSchema
        });

        console.log('🤖 Workflow Agent Full Response:', JSON.stringify(result));

        let tradeData = result.object;

        if (!tradeData && result.text) {
            console.log('⚠️ result.object is empty, trying fallback parsing on result.text...');
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    tradeData = JSON.parse(jsonMatch[0]);
                    console.log('✅ Fallback parsing successful');
                } catch (e) {
                    console.error('❌ Failed to parse fallback JSON:', e.message);
                }
            }
        }

        if (!tradeData) {
            throw new Error('LLM failed to produce structured trade data. Raw response: ' + (result.text || 'empty'));
        }

        console.log('📦 Parsed Trade Data:', JSON.stringify(tradeData));
        return tradeData;
    }
});

const saveTradeStep = createStep({
    id: 'saveTrade',
    inputSchema: z.any(), // Relaxed for debugging
    execute: async ({ inputData, getInitData }) => {
        console.log('📥 saveTrade received inputData:', JSON.stringify(inputData));

        // inputData is now the output from parseTradeStep
        const tradeData = inputData;

        // Get the original input via getInitData
        const triggerData = getInitData();
        const rawText = triggerData?.text || '';
        console.log('📄 saveTrade original text:', rawText);

        const { symbol, side, quantity, price, currency } = tradeData;
        const stmt = db.prepare('INSERT INTO trades (symbol, side, quantity, price, currency, raw_text) VALUES (?, ?, ?, ?, ?, ?)');
        const info = stmt.run(symbol, side, quantity, price, currency, rawText);

        return { success: true, id: info.lastInsertRowid, trade: tradeData };
    }
});

const tradeWorkflow = new Workflow({
    id: 'tradeWorkflow',
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.any()
})
    .then(parseTradeStep)
    .then(saveTradeStep)
    .commit();

const mastra = new Mastra({
    agents: { bubo: buboAgent },
    workflows: { trade: tradeWorkflow }
});

// 5. Express App Setup
const app = express();
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            "style-src": ["'self'", "'unsafe-inline'", "https:", "http:"],
            "img-src": ["'self'", "data:", "https:", "http:", "*"],
            "font-src": ["'self'", "https:", "http:", "data:"],
            "connect-src": ["'self'", "https:", "http:"],
            "frame-src": ["'self'", "https:", "http:"],
            "script-src-attr": ["'unsafe-inline'"],
        },
    },
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.post('/ask', async (req, res) => {
    try {
        const { message } = req.body;
        const agent = mastra.getAgent('bubo');
        const result = await agent.generate(message);
        res.json({ response: result.text });
    } catch (error) {
        console.error('Agent Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', services: ['express', 'mastra', 'firebase', 'sqlite', 'google-cloud'] });
});

// --- 5.1 Automated Notification System (Cron) ---
const ADVANCE_DAYS = 3; // Days before to start reminding

async function extractMetadata(url) {
    const MAX_RETRIES = 2;
    let attempt = 0;


    const performExtraction = async () => {
        try {
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Referer': 'https://www.google.com/',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 20000 // Increased timeout to 20s
            });
            const $ = cheerio.load(html);

            let title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('title').text();

            let description = $('meta[property="og:description"]').attr('content') ||
                $('meta[name="twitter:description"]').attr('content') ||
                $('meta[name="description"]').attr('content');

            let image = $('meta[property="og:image"]').attr('content') ||
                $('meta[name="twitter:image"]').attr('content');

            // Fallback for image
            if (!image) {
                image = $('link[rel="apple-touch-icon"]').attr('href') ||
                    $('link[rel="icon"]').attr('href') ||
                    $('link[rel="shortcut icon"]').attr('href');

                if (image && !image.startsWith('http')) {
                    try {
                        const urlObj = new URL(url);
                        image = new URL(image, urlObj.origin).href;
                    } catch (e) { }
                }
            }

            if (!title || title.trim() === '') {
                try {
                    title = new URL(url).hostname;
                } catch (e) {
                    title = url;
                }
            }

            return {
                title: title?.trim() || url,
                description: description?.trim() || '',
                image: image || ''
            };
        } catch (error) {
            if (attempt < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('timeout'))) {
                attempt++;
                console.log(`⚠️ Retry metadata extraction (${attempt}/${MAX_RETRIES}) for ${url}...`);
                return performExtraction();
            }
            throw error;
        }
    };

    try {
        return await performExtraction();
    } catch (error) {
        console.error(`❌ Metadata extraction failed for ${url}:`, error.message);
        let fallbackTitle = url;
        try {
            fallbackTitle = new URL(url).hostname;
        } catch (e) { }
        return { title: fallbackTitle, description: '', image: '' };
    }
}

function setupNotificationJobs(bot, db) {
    // Schedule: 09:30 and 20:30 daily
    const schedule = ['30 9 * * *', '30 20 * * *'];

    schedule.forEach(time => {
        cron.schedule(time, async () => {
            console.log(`⏰ [Cron] Running scheduled reminder check (${time})...`);

            try {
                // Find reminders that are:
                // 1. Not expired (event_date >= today)
                // 2. Within notice period (event_date <= today + ADVANCE_DAYS)
                // 3. Have a valid telegram_id
                const upcomingEvents = db.prepare(`
                    SELECT * FROM reminders 
                    WHERE event_date >= date('now') 
                    AND event_date <= date('now', '+' || ? || ' days')
                    AND telegram_id IS NOT NULL
                `).all(ADVANCE_DAYS);

                console.log(`⏰ [Cron] Found ${upcomingEvents.length} events to notify.`);

                for (const event of upcomingEvents) {
                    const message = `🔔 *Upcoming Event Reminder*\n\n📅 Date: ${event.event_date}\n📝 Details: ${event.description}\n\n_Don't forget to prepare!_`;
                    try {
                        await bot.sendMessage(event.telegram_id, message, { parse_mode: 'Markdown' }).catch(() => { });
                        console.log(`🚀 [Cron] Sent notification to TG:${event.telegram_id} for "${event.description}"`);
                    } catch (e) {
                        console.error(`❌ [Cron] Failed to notify ${event.telegram_id}:`, e.message);
                    }
                }
            } catch (err) {
                console.error('❌ [Cron] Error checking reminders:', err.message);
            }
        });
    });
}


// --- Data APIs for Console ---
app.get('/api/trades', (req, res) => {
    try {
        const trades = db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT 50').all();
        res.json(trades);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/reminders', (req, res) => {
    try {
        const reminders = db.prepare('SELECT * FROM reminders ORDER BY created_at DESC LIMIT 50').all();
        res.json(reminders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/urls', (req, res) => {
    try {
        const { collection, q } = req.query;
        let query = 'SELECT collected_urls.*, collections.name as collection_name FROM collected_urls LEFT JOIN collections ON collected_urls.collection_id = collections.id';
        const params = [];

        if (collection || q) {
            query += ' WHERE ';
            const conditions = [];
            if (collection) {
                if (collection === 'unsorted') {
                    conditions.push('collection_id IS NULL');
                } else {
                    conditions.push('collection_id = ?');
                    params.push(collection);
                }
            }
            if (q) {
                conditions.push('(title LIKE ? OR url LIKE ? OR description LIKE ?)');
                params.push(`%${q}%`, `%${q}%`, `%${q}%`);
            }
            query += conditions.join(' AND ');
        }

        query += ' ORDER BY created_at DESC LIMIT 100';
        const urls = db.prepare(query).all(...params);
        res.json(urls);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/urls', async (req, res) => {
    const { url, collection_id, title, description, image } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        // If metadata is provided by the client, use it. Otherwise, extract it.
        let metadata;
        if (title || description || image) {
            console.log(`📦 Using provided metadata for ${url}`);
            metadata = {
                title: title || url,
                description: description || '',
                image: image || ''
            };
        } else {
            console.log(`🔍 Extracting metadata for ${url}...`);
            metadata = await extractMetadata(url);
        }

        const existing = db.prepare('SELECT id FROM collected_urls WHERE url = ?').get(url);
        if (existing) {
            console.log(`🔄 Updating existing bookmark for ${url} (ID: ${existing.id})`);
            const updateStmt = db.prepare('UPDATE collected_urls SET title = ?, description = ?, image = ?, collection_id = ? WHERE id = ?');
            updateStmt.run(metadata.title, metadata.description, metadata.image, collection_id || null, existing.id);
            res.json({ id: existing.id, ...metadata });
        } else {
            console.log(`✨ Creating new bookmark for ${url}`);
            const insertStmt = db.prepare('INSERT INTO collected_urls (url, title, description, image, collection_id) VALUES (?, ?, ?, ?, ?)');
            const result = insertStmt.run(url, metadata.title, metadata.description, metadata.image, collection_id || null);
            res.json({ id: result.lastInsertRowid, ...metadata });
        }
    } catch (error) {
        console.error('API Error (add URL):', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/urls/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const stmt = db.prepare('DELETE FROM collected_urls WHERE id = ?');
        const result = stmt.run(id);
        if (result.changes > 0) {
            res.json({ success: true, message: 'Bookmark deleted' });
        } else {
            res.status(404).json({ error: 'Bookmark not found' });
        }
    } catch (error) {
        console.error('API Error (delete URL):', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/urls/refresh-all', async (req, res) => {
    try {
        const urls = db.prepare("SELECT * FROM collected_urls WHERE title IS NULL OR title = '' OR image IS NULL OR image = ''").all();
        console.log(`🔄 Refreshing metadata for ${urls.length} URLs...`);

        for (const item of urls) {
            const metadata = await extractMetadata(item.url);
            db.prepare('UPDATE collected_urls SET title = ?, description = ?, image = ? WHERE id = ?')
                .run(metadata.title, metadata.description, metadata.image, item.id);
        }

        res.json({ success: true, count: urls.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/urls/:id/refresh', async (req, res) => {
    const { id } = req.params;
    try {
        const item = db.prepare('SELECT url FROM collected_urls WHERE id = ?').get(id);
        if (!item) return res.status(404).json({ error: 'URL not found' });

        const metadata = await extractMetadata(item.url);
        db.prepare('UPDATE collected_urls SET title = ?, description = ?, image = ? WHERE id = ?')
            .run(metadata.title, metadata.description, metadata.image, id);

        res.json({ success: true, ...metadata });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/urls/:id', (req, res) => {
    const { id } = req.params;
    const { title, description, collection_id } = req.body;
    try {
        const stmt = db.prepare('UPDATE collected_urls SET title = ?, description = ?, collection_id = ? WHERE id = ?');
        stmt.run(title, description, collection_id, id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/urls/:id', (req, res) => {
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM collected_urls WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/collections', (req, res) => {
    try {
        const collections = db.prepare('SELECT * FROM collections ORDER BY name ASC').all();
        // Add counts
        const collectionsWithCounts = collections.map(c => {
            const count = db.prepare('SELECT COUNT(*) as count FROM collected_urls WHERE collection_id = ?').get(c.id).count;
            return { ...c, count };
        });
        // Add Unsorted count
        const unsortedCount = db.prepare('SELECT COUNT(*) as count FROM collected_urls WHERE collection_id IS NULL').get().count;
        const totalCount = db.prepare('SELECT COUNT(*) as count FROM collected_urls').get().count;

        res.json({
            collections: collectionsWithCounts,
            unsortedCount,
            totalCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/collections', (req, res) => {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const stmt = db.prepare('INSERT INTO collections (name, color) VALUES (?, ?)');
        const result = stmt.run(name, color || '#3b82f6');
        res.json({ id: result.lastInsertRowid, name, color });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use('/bookmarks', express.static(path.join(__dirname, 'bookmarks')));

app.get('/api/users', (req, res) => {
    try {
        const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/notify', async (req, res) => {
    const { username, message } = req.body;

    if (!username || !message) {
        return res.status(400).json({ error: 'Missing username or message' });
    }

    try {
        const user = db.prepare('SELECT telegram_id FROM users WHERE username = ?').get(username);

        if (!user) {
            return res.status(404).json({ error: 'User not found in registry' });
        }

        const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TG_TOKEN) {
            return res.status(500).json({ error: 'Telegram bot not configured' });
        }

        // We use the existing bot instance if it exists, otherwise we can't send.
        // But since we are in the same file, we can expose 'bot' from the setup below or define it higher up.
        // Let's ensure 'bot' is accessible.
        if (typeof bot !== 'undefined') {
            await bot.sendMessage(user.telegram_id, message).catch(() => { });
            res.json({ success: true, message: `Notification sent to ${username}` });
        } else {
            res.status(503).json({ error: 'Telegram bot service unavailable' });
        }
    } catch (error) {
        console.error('Notification Error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BuboAgent is flying high on port ${PORT}`);
});

// 6. Telegram Bot Setup
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let bot; // Declare in higher scope for API access

if (TG_TOKEN) {
    bot = new TelegramBot(TG_TOKEN, {
        polling: {
            autoStart: true,
            params: {
                timeout: 30 // Increased poll timeout
            }
        },
        filepath: false // Recommended to avoid some local file issues
    });
    console.log('🤖 Telegram Bot is active and listening...');

    // Start automated notification jobs
    setupNotificationJobs(bot, db);

    bot.on('polling_error', async (error) => {
        const errorCode = error.code || 'UNKNOWN';
        if (error.message.includes('401')) {
            console.error('❌ Telegram Error: Unauthorized (401). Your TELEGRAM_BOT_TOKEN is likely invalid.');
            return;
        }

        console.error(`❌ Telegram Polling Error [${errorCode}]:`, error.message);

        // Handle recovery for common connection issues after sleep/wake
        if (errorCode === 'EFATAL' || error.message.includes('ECONNRESET') || error.message.includes('socket hang up')) {
            console.log('🔄 Attempting to recover Telegram connection...');
            try {
                // If the bot is already polling, stop it first
                if (bot.isPolling()) {
                    await bot.stopPolling();
                }

                // Wait 2 seconds before restarting to give the system time to stabilize
                setTimeout(async () => {
                    try {
                        await bot.startPolling();
                        console.log('✅ Telegram Polling restarted successfully.');
                    } catch (startErr) {
                        console.error('❌ Failed to restart Telegram Polling:', startErr.message);
                    }
                }, 2000);
            } catch (err) {
                console.error('❌ Error during recovery attempt:', err.message);
            }
        }
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text) return;

        // Handle /registerBB [username]
        if (text.startsWith('/registerBB')) {
            const parts = text.split(' ');
            if (parts.length < 2) {
                bot.sendMessage(chatId, '❌ Usage: /registerBB [your_username]').catch(() => { });
                return;
            }
            const username = parts[1].trim();
            const from = msg.from || {};

            try {
                const stmt = db.prepare('INSERT OR REPLACE INTO users (telegram_id, username, first_name, last_name) VALUES (?, ?, ?, ?)');
                stmt.run(chatId.toString(), username, from.first_name || '', from.last_name || '');
                bot.sendMessage(chatId, `✅ Registration successful! You are now registered as "${username}".`).catch(() => { });
                console.log(`👤 New User Registered: ${username} (TG: ${chatId})`);
            } catch (err) {
                console.error('Registration Error:', err);
                bot.sendMessage(chatId, `❌ Registration failed: ${err.message}`).catch(() => { });
            }
            return;
        }

        // --- URL Collection Logic ---
        const urlRegex = /^(https?:\/\/[^\s]+)$/i;
        const urlMatch = text.trim().match(urlRegex);

        if (urlMatch) {
            const url = urlMatch[1];
            console.log(`📌 Collecting URL: ${url}`);
            bot.sendChatAction(chatId, 'typing');
            try {
                const metadata = await extractMetadata(url);
                const stmt = db.prepare('INSERT INTO collected_urls (url, title, description, image) VALUES (?, ?, ?, ?)');
                stmt.run(url, metadata.title, metadata.description, metadata.image);
                bot.sendMessage(chatId, `✅ Bookmark saved!\n🔖 *${metadata.title}*\n${metadata.description ? `\n_${metadata.description}_` : ''}`, { parse_mode: 'Markdown' }).catch(() => { });
                return; // Stop further processing by Agent
            } catch (err) {
                console.error('Database Error:', err);
                // Fallback to agent if DB fails
            }
        }

        // --- Trade Detection Logic ---
        const tradeKeywords = ['买入', '卖出', 'buy', 'sell'];
        if (tradeKeywords.some(k => text.toLowerCase().includes(k)) && text.length < 100) {
            console.log(`📈 Trade detected: ${text}`);
            try {
                bot.sendChatAction(chatId, 'typing');
                const workflow = mastra.getWorkflow('trade');
                const run = await workflow.createRun();
                const result = await run.start({ inputData: { text } });

                console.log('🏁 Workflow Run Completed. Extraction start...');

                // The most reliable way to get the output of the final step (saveTrade)
                // is to look at the top-level 'result' field of the run state.
                let tradeResult = result?.result;

                // Fallback: check if it's nested in a results object
                if (!tradeResult || !tradeResult.trade) {
                    const alt = result?.results || result?.state?.results || {};
                    if (alt.saveTrade) tradeResult = alt.saveTrade;
                }

                if (tradeResult && tradeResult.trade) {
                    const t = tradeResult.trade;
                    bot.sendMessage(chatId, `✅ Trade Recorded!\n🔹 Asset: ${t.symbol}\n🔹 Side: ${t.side}\n🔹 Qty: ${t.quantity}\n🔹 Price: ${t.price} ${t.currency}`).catch(() => { });
                } else {
                    console.log('⚠️ Could not find trade data in result. Available keys:', Object.keys(result || {}));
                    bot.sendMessage(chatId, `📉 Trade detected but details couldn't be auto-parsed. Input: "${text}"`).catch(() => { });
                }
                return;
            } catch (err) {
                console.error('Workflow Error:', err.message);
                bot.sendMessage(chatId, `❌ Workflow Error: ${err.message}`).catch(() => { });
                return;
            }
        }

        // Handle explicit /stock command
        if (text.startsWith('/stock ')) {
            const ticker = text.replace('/stock ', '').trim().toUpperCase();
            if (!ticker) {
                bot.sendMessage(chatId, 'Please provide a ticker symbol. Example: /stock AAPL').catch(() => { });
                return;
            }
            bot.sendChatAction(chatId, 'typing');
            try {
                const quote = await API_FetchQuote(ticker);
                bot.sendMessage(chatId, `📈 ${quote.symbol}: ${quote.price} ${quote.currency}\nChange: ${quote.change} (${quote.percent}%)`).catch(() => { });
            } catch (err) {
                bot.sendMessage(chatId, `❌ Error: ${err.message}`).catch(() => { });
            }
            return;
        }

        // Handle /recent or /history command
        if (text.startsWith('/recent') || text.startsWith('/history') || text === '最近交易') {
            const limit = 5;
            bot.sendChatAction(chatId, 'typing');
            try {
                const stmt = db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?');
                const trades = stmt.all(limit);
                if (trades.length === 0) {
                    bot.sendMessage(chatId, '📭 No trades recorded yet.').catch(() => { });
                } else {
                    const response = trades.map(t =>
                        `📝 ${t.created_at}\n🔹 *${t.side}* ${t.quantity} ${t.symbol}\n💰 Price: ${t.price} ${t.currency}`
                    ).join('\n\n');
                    bot.sendMessage(chatId, `📂 *Recent ${trades.length} Trades:*\n\n${response}`, { parse_mode: 'Markdown' }).catch(() => { });
                }
            } catch (err) {
                console.error('Database Error:', err);
                bot.sendMessage(chatId, `❌ Error fetching trades: ${err.message}`).catch(() => { });
            }
            return;
        }

        if (text === '/start') {
            bot.sendMessage(chatId, 'Hello! I am BuboAgent. Send me a command or data to process.').catch(() => { });
            return;
        }

        console.log(`📩 Telegram Message from ${chatId}: ${text}`);

        try {
            // Send typing action to Telegram
            bot.sendChatAction(chatId, 'typing').catch(() => { });

            const agent = mastra.getAgent('bubo');
            const result = await agent.generate(`${text} (Context: user_tg_id=${chatId})`);

            bot.sendMessage(chatId, result.text).catch(err => {
                console.error('❌ Failed to send Agent response:', err.message);
            });
        } catch (error) {
            console.error('Telegram Bot Agent Error:', error.message);
            bot.sendMessage(chatId, 'Sorry, I encountered an error processing that request.').catch(() => { });
        }
    });
} else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN not found in .env. Telegram entry point disabled.');
}
