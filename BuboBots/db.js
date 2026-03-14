const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

const dbPath = path.resolve(__dirname, 'data', 'bubobots.db');
fs.ensureDirSync(path.dirname(dbPath));

const db = new sqlite3.Database(dbPath);

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Schedules table
            db.run(`
                CREATE TABLE IF NOT EXISTS schedules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    message TEXT,
                    cron_expression TEXT NOT NULL,
                    is_function INTEGER DEFAULT 0,
                    fn_module TEXT,
                    fn_name TEXT,
                    fn_args TEXT,
                    active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else {
                    // Try to add new columns if the table already existed and is missing them
                    // This is a simple migration approach for SQLite
                    db.run("ALTER TABLE schedules ADD COLUMN is_function INTEGER DEFAULT 0", () => {});
                    db.run("ALTER TABLE schedules ADD COLUMN fn_module TEXT", () => {});
                    db.run("ALTER TABLE schedules ADD COLUMN fn_name TEXT", () => {});
                    db.run("ALTER TABLE schedules ADD COLUMN fn_args TEXT", () => {});
                }

                // TickerTrack table
                db.run(`
                    CREATE TABLE IF NOT EXISTS tickerTrack (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ticker TEXT NOT NULL UNIQUE,
                        quoteMax REAL,
                        quoteMin REAL
                    )
                `, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    });
};

const getSchedules = () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM schedules", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const addSchedule = (provider, target_id, message, cron_expression, is_function = 0, fn_module = null, fn_name = null, fn_args = null) => {
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT INTO schedules (provider, target_id, message, cron_expression, is_function, fn_module, fn_name, fn_args) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [provider, target_id, message, cron_expression, is_function ? 1 : 0, fn_module, fn_name, fn_args],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

const deleteSchedule = (id) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM schedules WHERE id = ?", [id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const getTickers = () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM tickerTrack", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const addTicker = (ticker, quoteMax, quoteMin) => {
    return new Promise((resolve, reject) => {
        // Use UPSERT to allow easy updating via the same API
        db.run(
            `INSERT INTO tickerTrack (ticker, quoteMax, quoteMin) 
             VALUES (?, ?, ?)
             ON CONFLICT(ticker) DO UPDATE SET 
             quoteMax = excluded.quoteMax, 
             quoteMin = excluded.quoteMin`,
            [ticker.toUpperCase(), quoteMax, quoteMin],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

const deleteTicker = (id) => {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM tickerTrack WHERE id = ?", [id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

module.exports = {
    initDb,
    getSchedules,
    addSchedule,
    deleteSchedule,
    getTickers,
    addTicker,
    deleteTicker
};
