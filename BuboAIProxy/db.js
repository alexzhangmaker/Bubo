require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

const dbPath = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(__dirname, 'data', 'aiproxy.db');
fs.ensureDirSync(path.dirname(dbPath));

const db = new sqlite3.Database(dbPath);

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Requests Queue table
            db.run(`
                CREATE TABLE IF NOT EXISTS requests (
                    uuid TEXT PRIMARY KEY,
                    command TEXT NOT NULL,
                    params TEXT,
                    status TEXT DEFAULT 'pending',
                    result TEXT,
                    error TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Command Dictionary table
            db.run(`
                CREATE TABLE IF NOT EXISTS commands (
                    command TEXT PRIMARY KEY,
                    prompt_template TEXT NOT NULL,
                    model TEXT DEFAULT 'gemini',
                    parameters TEXT
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
};

// Database operation helpers
const addRequest = (uuid, command, params) => {
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT INTO requests (uuid, command, params) VALUES (?, ?, ?)",
            [uuid, command, JSON.stringify(params)],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

const getRequest = (uuid) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM requests WHERE uuid = ?", [uuid], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const updateRequestStatus = (uuid, status, result = null, error = null) => {
    return new Promise((resolve, reject) => {
        db.run(
            "UPDATE requests SET status = ?, result = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?",
            [status, result ? JSON.stringify(result) : null, error, uuid],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

const getPendingRequests = () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM requests WHERE status = 'pending' ORDER BY created_at ASC", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const getCommandConfig = (command) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM commands WHERE command = ?", [command], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const getAllCommands = () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM commands", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const saveCommand = (cmd) => {
    const { command, prompt_template, model, parameters } = cmd;
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT OR REPLACE INTO commands (command, prompt_template, model, parameters) VALUES (?, ?, ?, ?)",
            [command, prompt_template, model, JSON.stringify(parameters)],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

module.exports = {
    initDb,
    addRequest,
    getRequest,
    updateRequestStatus,
    getPendingRequests,
    getCommandConfig,
    getAllCommands,
    saveCommand
};
