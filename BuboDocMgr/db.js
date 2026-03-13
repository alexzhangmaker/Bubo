require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

const dbPath = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(__dirname, 'data', 'docs.db');
fs.ensureDirSync(path.dirname(dbPath));

const db = new sqlite3.Database(dbPath);

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_uri TEXT,
                    file_type TEXT,
                    size INTEGER,
                    last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
                    gdrive_id TEXT,
                    notes TEXT
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
};

const getAllDocs = () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM documents ORDER BY last_modified DESC", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const getDocById = (id) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM documents WHERE id = ?", [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const addDoc = (doc) => {
    const { title, file_path, file_uri, file_type, size } = doc;
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT INTO documents (title, file_path, file_uri, file_type, size, last_modified) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [title, file_path, file_uri, file_type, size],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

const updateDoc = (id, doc) => {
    const { title } = doc;
    return new Promise((resolve, reject) => {
        db.run(
            "UPDATE documents SET title = ?, last_modified = CURRENT_TIMESTAMP WHERE id = ?",
            [title, id],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

const deleteDoc = (id) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM documents WHERE id = ?", [id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const updateGDriveId = (id, gdriveId) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE documents SET gdrive_id = ? WHERE id = ?", [gdriveId, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const updateNotes = (id, notes) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE documents SET notes = ? WHERE id = ?", [notes, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

module.exports = {
    initDb,
    getAllDocs,
    getDocById,
    addDoc,
    updateDoc,
    deleteDoc,
    updateGDriveId,
    updateNotes
};
