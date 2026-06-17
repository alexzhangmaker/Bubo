from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import os
import requests
import threading
import time
from datetime import datetime, timedelta
from logger import setup_logger, LoggingMiddleware
from fetcher import fetch_dividend_history

# Initialize app and logger
app = FastAPI(title="Bubo Dividend Tracker Service")
logger = setup_logger("DivTracker", os.path.dirname(__file__))
app.add_middleware(LoggingMiddleware, logger=logger)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(__file__), "database.sqlite")
ACCOUNTING_SERVICE_URL = "http://localhost:3008"
MKT_SERVICE_URL = "http://localhost:3009"

# Pydantic models
class DividendRecord(BaseModel):
    ticker: str
    ex_div_date: str
    record_date: str | None = None
    payment_date: str | None = None
    amount: float
    currency: str
    dividend_type: str | None = "Cash"

class FetchRequest(BaseModel):
    tickers: list[str] | None = None

# Database helpers
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dividends (
        ticker TEXT,
        ex_div_date TEXT,
        record_date TEXT,
        payment_date TEXT,
        amount REAL,
        currency TEXT,
        dividend_type TEXT,
        updated_at TEXT,
        PRIMARY KEY (ticker, ex_div_date)
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS fetch_log (
        ticker TEXT PRIMARY KEY,
        last_fetched_at TEXT,
        status TEXT,
        error_message TEXT
    )
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialized successfully.")

def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Helper to fetch exchange rate
def get_ex_rate(from_cur: str, to_cur: str = "CNY") -> float:
    if from_cur.upper() == to_cur.upper():
        return 1.0
    try:
        url = f"{MKT_SERVICE_URL}/api/exrate/{from_cur.upper()}/{to_cur.upper()}"
        res = requests.get(url, timeout=3)
        if res.status_code == 200:
            return float(res.json().get("rate", 1.0))
    except Exception as e:
        logger.warning(f"Failed to fetch exchange rate from {from_cur} to {to_cur}: {e}")
    # Simple hardcoded fallbacks if API fails
    fallbacks = {"USD": 7.25, "HKD": 0.93, "GBP": 9.20, "CNY": 1.0}
    return fallbacks.get(from_cur.upper(), 1.0) / fallbacks.get(to_cur.upper(), 1.0)

# Fetching worker in background
def fetch_worker(tickers: list[str]):
    logger.info(f"Background fetch worker started for tickers: {tickers}")
    conn = _connect()
    cursor = conn.cursor()
    
    for ticker in tickers:
        ticker = ticker.upper()
        # Mark as fetching
        cursor.execute(
            "INSERT OR REPLACE INTO fetch_log (ticker, last_fetched_at, status, error_message) VALUES (?, ?, ?, ?)",
            (ticker, datetime.now().isoformat(), "fetching", None)
        )
        conn.commit()
        
        try:
            logger.info(f"Fetching dividend data for {ticker}...")
            records = fetch_dividend_history(ticker)
            if records:
                for r in records:
                    cursor.execute("""
                    INSERT OR REPLACE INTO dividends 
                    (ticker, ex_div_date, record_date, payment_date, amount, currency, dividend_type, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        r['ticker'].upper(), r['ex_div_date'], r['record_date'], r['payment_date'],
                        r['amount'], r['currency'].upper(), r['dividend_type'], r['updated_at']
                    ))
                logger.info(f"Fetched and stored {len(records)} dividend records for {ticker}.")
                cursor.execute(
                    "INSERT OR REPLACE INTO fetch_log (ticker, last_fetched_at, status, error_message) VALUES (?, ?, ?, ?)",
                    (ticker, datetime.now().isoformat(), "success", None)
                )
            else:
                logger.info(f"No dividend records found for {ticker}.")
                cursor.execute(
                    "INSERT OR REPLACE INTO fetch_log (ticker, last_fetched_at, status, error_message) VALUES (?, ?, ?, ?)",
                    (ticker, datetime.now().isoformat(), "success", "No records found")
                )
            conn.commit()
        except Exception as e:
            logger.error(f"Failed fetching dividends for {ticker}: {e}")
            cursor.execute(
                "INSERT OR REPLACE INTO fetch_log (ticker, last_fetched_at, status, error_message) VALUES (?, ?, ?, ?)",
                (ticker, datetime.now().isoformat(), "failed", str(e))
            )
            conn.commit()
            
    conn.close()
    logger.info("Background fetch worker completed.")

# API endpoints

@app.get("/", response_class=HTMLResponse)
def read_root():
    html_path = os.path.join(os.path.dirname(__file__), "console.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return f.read()

@app.get("/api/dividends")
def get_dividends(ticker: str | None = None, start_date: str | None = None, end_date: str | None = None):
    conn = _connect()
    cursor = conn.cursor()
    query = "SELECT * FROM dividends WHERE 1=1"
    params = []
    
    if ticker:
        query += " AND ticker = ?"
        params.append(ticker.upper())
    if start_date:
        query += " AND ex_div_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND ex_div_date <= ?"
        params.append(end_date)
        
    query += " ORDER BY ex_div_date DESC"
    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

@app.post("/api/dividends/fetch")
def start_fetch(req: FetchRequest, background_tasks: BackgroundTasks):
    tickers = req.tickers
    
    # If no tickers specified, retrieve active ones from AccountingService
    if not tickers:
        try:
            res = requests.get(f"{ACCOUNTING_SERVICE_URL}/api/assets", timeout=5)
            if res.status_code == 200:
                assets = res.json()
                tickers = list(set(a['ticker'].upper() for a in assets if a.get('ticker') and a.get('assetType') == '股票'))
            else:
                raise Exception(f"AccountingService returned status {res.status_code}")
        except Exception as e:
            logger.error(f"Failed to fetch active assets from AccountingService: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get active assets: {e}")
            
    if not tickers:
        return {"status": "ignored", "message": "No active tickers found to fetch."}
        
    # Filter out custom non-stock assets
    valid_tickers = [t for t in tickers if not (t.startswith("US-GOVT") or t.startswith("CASH"))]
    
    background_tasks.add_task(fetch_worker, valid_tickers)
    return {"status": "processing", "message": f"Sync started in background for {len(valid_tickers)} tickers.", "tickers": valid_tickers}

@app.get("/api/fetch_log")
def get_fetch_log():
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fetch_log ORDER BY last_fetched_at DESC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

@app.post("/api/dividends/manual")
def add_manual_dividend(record: DividendRecord):
    conn = _connect()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT OR REPLACE INTO dividends 
        (ticker, ex_div_date, record_date, payment_date, amount, currency, dividend_type, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record.ticker.upper(), record.ex_div_date, record.record_date, record.payment_date,
            record.amount, record.currency.upper(), record.dividend_type, datetime.now().isoformat()
        ))
        conn.commit()
        return {"status": "success", "message": "Dividend record saved successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/dividends/{ticker}/{ex_div_date}")
def delete_dividend(ticker: str, ex_div_date: str):
    conn = _connect()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM dividends WHERE ticker = ? AND ex_div_date = ?", (ticker.upper(), ex_div_date))
        conn.commit()
        return {"status": "success", "message": "Dividend record deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.get("/api/assets")
def get_active_assets():
    try:
        res = requests.get(f"{ACCOUNTING_SERVICE_URL}/api/assets", timeout=5)
        if res.status_code == 200:
            return res.json()
        else:
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch assets from AccountingService")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/calendar")
def get_dividend_calendar():
    # 1. Fetch active portfolio assets
    try:
        res = requests.get(f"{ACCOUNTING_SERVICE_URL}/api/assets", timeout=5)
        if res.status_code != 200:
            raise Exception(f"AccountingService returned code {res.status_code}")
        assets = res.json()
    except Exception as e:
        logger.error(f"Calendar fetch failed - cannot connect to AccountingService: {e}")
        return {"events": [], "summary": {}, "error": f"AccountingService connection failed: {e}"}
        
    # Get unique active tickers and build a mapping of ticker -> list of account positions
    holdings = {}
    total_cost_cny = 0.0
    for a in assets:
        if not a.get('ticker') or a.get('shares', 0) <= 0:
            continue
        ticker = a['ticker'].upper()
        if ticker.startswith("US-GOVT") or ticker.startswith("CASH"):
            continue
            
        if ticker not in holdings:
            holdings[ticker] = []
        holdings[ticker].append(a)
        
        # Calculate cost in CNY for yields
        shares = float(a.get('shares', 0))
        cost = float(a.get('costPerShare', 0))
        currency = a.get('currency', 'CNY').upper()
        rate = get_ex_rate(currency, "CNY")
        total_cost_cny += (shares * cost * rate)

    if not holdings:
        return {"events": [], "summary": {"total_projected_12m_cny": 0.0, "total_received_ytd_cny": 0.0, "weighted_yield": 0.0, "upcoming_event": None}}

    # 2. Query dividends database for all active tickers
    conn = _connect()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in holdings.keys())
    cursor.execute(f"SELECT * FROM dividends WHERE ticker IN ({placeholders}) ORDER BY ex_div_date DESC", list(holdings.keys()))
    div_records = [dict(row) for row in cursor.fetchall()]
    conn.close()

    # Cache exchange rates during this request
    ex_rates = {}
    def get_cached_rate(cur):
        cur = cur.upper()
        if cur not in ex_rates:
            ex_rates[cur] = get_ex_rate(cur, "CNY")
        return ex_rates[cur]

    # 3. Construct events list
    events = []
    today_str = datetime.now().strftime('%Y-%m-%d')
    start_ytd_str = datetime(datetime.now().year, 1, 1).strftime('%Y-%m-%d')
    end_12m_str = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
    
    total_projected_12m_cny = 0.0
    total_received_ytd_cny = 0.0
    upcoming_events = []

    for div in div_records:
        ticker = div['ticker']
        amount = div['amount']
        currency = div['currency'].upper()
        rate = get_cached_rate(currency)
        
        # Match with all accounts holding this security
        positions = holdings.get(ticker, [])
        for pos in positions:
            shares = pos['shares']
            payout = shares * amount
            payout_cny = payout * rate
            
            # Use payment_date for calendar calculations, fallback to ex_div_date
            primary_date = div['payment_date'] or div['ex_div_date']
            
            event = {
                "ticker": ticker,
                "accountID": pos['accountID'],
                "shares": shares,
                "amount": amount,
                "currency": currency,
                "payout": payout,
                "payout_cny": payout_cny,
                "ex_div_date": div['ex_div_date'],
                "record_date": div['record_date'],
                "payment_date": div['payment_date'],
                "dividend_type": div['dividend_type'],
                "primary_date": primary_date
            }
            events.append(event)
            
            # Projection summaries:
            # Received YTD: paid between Jan 1 of current year and today
            if start_ytd_str <= primary_date <= today_str:
                total_received_ytd_cny += payout_cny
                
            # Projected 12M: paid in the next 12 months (today <= date <= today + 365 days)
            if today_str <= primary_date <= end_12m_str:
                total_projected_12m_cny += payout_cny
                upcoming_events.append(event)

    # Find the single next upcoming event
    upcoming_events.sort(key=lambda e: e['primary_date'])
    next_event = upcoming_events[0] if upcoming_events else None
    
    # Calculate yield on cost
    weighted_yield = (total_projected_12m_cny / total_cost_cny * 100) if total_cost_cny > 0 else 0.0

    return {
        "events": sorted(events, key=lambda e: e['primary_date'], reverse=True),
        "summary": {
            "total_projected_12m_cny": round(total_projected_12m_cny, 2),
            "total_received_ytd_cny": round(total_received_ytd_cny, 2),
            "weighted_yield": round(weighted_yield, 2),
            "upcoming_event": next_event
        }
    }

# Background scheduler thread
def start_scheduler():
    def run_scheduler():
        logger.info("Auto-sync background scheduler started (runs every 24 hours).")
        while True:
            # Sync once every 24 hours
            time.sleep(24 * 3600)
            try:
                logger.info("Auto-sync: Triggering background dividend updates...")
                res = requests.get(f"{ACCOUNTING_SERVICE_URL}/api/assets", timeout=5)
                if res.status_code == 200:
                    assets = res.json()
                    tickers = list(set(a['ticker'].upper() for a in assets if a.get('ticker') and a.get('assetType') == '股票'))
                    valid_tickers = [t for t in tickers if not (t.startswith("US-GOVT") or t.startswith("CASH"))]
                    if valid_tickers:
                        fetch_worker(valid_tickers)
                else:
                    logger.error(f"Auto-sync failed to fetch assets: status {res.status_code}")
            except Exception as e:
                logger.error(f"Auto-sync scheduler encountered an error: {e}")
                
    t = threading.Thread(target=run_scheduler, daemon=True)
    t.start()

@app.on_event("startup")
def startup_event():
    init_db()
    start_scheduler()
    logger.info("DivTracker service startup tasks completed.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3011)
