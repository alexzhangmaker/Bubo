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

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_archived INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memos (
    uuid TEXT PRIMARY KEY,
    title TEXT,             -- Also serves as "Question"
    tags TEXT,              -- Comma separated tags
    project_id INTEGER,     -- Reference to projects.id
    content_uuid TEXT,      -- Reference to files.uuid
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (content_uuid) REFERENCES files(uuid),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
`);

// Migration: Add project_id to memos if it doesn't exist (for existing databases)
try {
  db.exec("ALTER TABLE memos ADD COLUMN project_id INTEGER REFERENCES projects(id)");
} catch (e) {
  // Column likely already exists
}

export default db;
