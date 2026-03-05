import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const dbPath = process.env.DB_FILE || './metadata.db';
const db = new Database(dbPath);

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    uuid TEXT PRIMARY KEY,
    drive_id TEXT UNIQUE,
    name TEXT,
    mime_type TEXT,
    url TEXT,
    size INTEGER,
    last_modified TEXT,
    cache_path TEXT,
    cache_status TEXT DEFAULT 'pending', -- 'pending', 'cached', 'failed'
    last_cached_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
