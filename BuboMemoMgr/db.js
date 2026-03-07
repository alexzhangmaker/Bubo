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
  );

  CREATE TABLE IF NOT EXISTS memos (
    uuid TEXT PRIMARY KEY,
    title TEXT,             -- Also serves as "Question"
    tags TEXT,              -- Comma separated tags
    content_uuid TEXT,      -- Reference to files.uuid
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_uuid) REFERENCES files(uuid)
  );
`);

export default db;
