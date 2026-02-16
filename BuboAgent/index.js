import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Mastra } from '@mastra/core';
import { Gemini } from '@mastra/core'; // Adjusting based on common mastra patterns
import admin from 'firebase-admin';
import * as xlsx from 'xlsx';
import { google } from 'googleapis';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Initialize SQLite
const db = new Database('bubo_agent.db');
db.exec('CREATE TABLE IF NOT EXISTS memory (id TEXT PRIMARY KEY, content TEXT)');

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

// 3. Initialize Google Services (Auth)
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// 4. Initialize Mastra Agent
const mastra = new Mastra({
    agents: {
        bubo: {
            name: 'BuboAgent',
            instructions: 'You are a powerful data assistant helping with Firebase, Excel, and Google Cloud services.',
            model: {
                provider: 'GOOGLE',
                name: 'gemini-1.5-pro',
                apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
            },
            tools: {
                // Example tool definitions
                readFirebase: {
                    execute: async ({ path }) => {
                        const snapshot = await rtdb.ref(path).once('value');
                        return snapshot.val();
                    }
                },
                readExcel: {
                    execute: async ({ filePath }) => {
                        const workbook = xlsx.readFile(filePath);
                        const sheetName = workbook.SheetNames[0];
                        return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    }
                },
                listDriveFiles: {
                    execute: async () => {
                        const res = await drive.files.list({ pageSize: 10 });
                        return res.data.files;
                    }
                }
            }
        }
    }
});

// 5. Express App Setup
const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.post('/ask', async (req, res) => {
    try {
        const { message } = req.body;
        const agent = mastra.getAgent('bubo');
        const response = await agent.generate(message);
        res.json({ response });
    } catch (error) {
        console.error('Agent Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', services: ['express', 'mastra', 'firebase', 'sqlite', 'google-cloud'] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BuboAgent is flying high on port ${PORT}`);
});
