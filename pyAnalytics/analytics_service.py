from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import os
import json
from logger import setup_logger, LoggingMiddleware

app = FastAPI(title="Bubo Analytics Service")

logger = setup_logger("pyAnalytics", os.path.dirname(__file__))
app.add_middleware(LoggingMiddleware, logger=logger)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = os.path.join(os.path.dirname(__file__), "portfolio_history.sqlite")


def _connect():
    if not os.path.exists(DB_FILE):
        raise HTTPException(status_code=404, detail="Database not found. Run export_portfolio_snapshot.py first.")
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/", response_class=HTMLResponse)
def read_root():
    html_path = os.path.join(os.path.dirname(__file__), "console.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return f.read()


@app.post("/api/sync")
def sync_snapshot():
    try:
        import sys
        import subprocess
        script_path = os.path.join(os.path.dirname(__file__), "export_portfolio_snapshot.py")
        result = subprocess.run([sys.executable, script_path], capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"Script failed: {result.stderr}")
        return {"message": "Snapshot sync complete", "output": result.stdout}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Structured query APIs ---

@app.get("/api/dates")
def get_dates():
    try:
        conn = _connect()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT snapshot_date FROM snapshots ORDER BY snapshot_date DESC")
        dates = [row[0] for row in cursor.fetchall()]
        conn.close()
        return dates
    except HTTPException:
        return []
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/history/{date}")
def get_history(date: str):
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM snapshots WHERE snapshot_date = ? ORDER BY totalValueTTMCNY DESC",
        (date,)
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


# --- DuckDB-Wasm data feed: all snapshots as JSON ---

@app.get("/api/data/all")
def get_all_data():
    """Return all snapshot records as a flat JSON array for DuckDB-Wasm ingestion."""
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM snapshots ORDER BY snapshot_date, ticker")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

@app.get("/api/data/accounts/all")
def get_all_accounts_data():
    """Return all account snapshot records as a flat JSON array for DuckDB-Wasm ingestion."""
    try:
        conn = _connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM account_snapshots ORDER BY snapshot_date, accountID")
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except sqlite3.OperationalError:
        # If the table doesn't exist yet, return an empty list gracefully
        return []


# --- Company Financials APIs ---

class SQLRequest(BaseModel):
    sql: str

@app.get("/api/data/financials/all")
def get_all_financials():
    """Return all company financials records as a flat JSON array."""
    try:
        conn = _connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM company_financials ORDER BY ticker, year")
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except sqlite3.OperationalError:
        return []

@app.post("/api/sql/execute")
def execute_sql(req: SQLRequest):
    """Execute raw SQL statements against the SQLite database."""
    try:
        conn = _connect()
        cursor = conn.cursor()
        cursor.execute(req.sql)
        conn.commit()
        
        if req.sql.strip().upper().startswith("SELECT"):
            rows = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return {"status": "success", "rows": rows}
        else:
            rowcount = cursor.rowcount
            conn.close()
            return {"status": "success", "message": f"Executed successfully. Rows affected: {rowcount}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/bond_china")
def get_bond_china():
    try:
        from datetime import datetime, timedelta
        import akshare as ak
        
        # Try to find a recent date that has data (within last 10 days)
        today = datetime.now()
        for i in range(1, 11):
            date_str = (today - timedelta(days=i)).strftime("%Y%m%d")
            try:
                df = ak.bond_china_close_return(symbol="国债", start_date=date_str, end_date=date_str)
                if df is not None and not df.empty:
                    # Filter 10Y and 30Y (support both float 10.0/30.0 and string '10年'/'30年')
                    row_10y = df[(df['期限'] == 10.0) | (df['期限'] == '10年')]
                    row_30y = df[(df['期限'] == 30.0) | (df['期限'] == '30年')]
                    
                    res = []
                    if not row_10y.empty:
                        item = row_10y.iloc[0]
                        res.append({
                            "name": "中国国债10年期 (CN 10Y)",
                            "from": "10-00",
                            "rate": float(item['到期收益率']),
                            "record_date": str(item['日期']),
                            "source": "中债国债到期收益率曲线 (akshare)"
                        })
                    if not row_30y.empty:
                        item = row_30y.iloc[0]
                        res.append({
                            "name": "中国国债30年期 (CN 30Y)",
                            "from": "30-00",
                            "rate": float(item['到期收益率']),
                            "record_date": str(item['日期']),
                            "source": "中债国债到期收益率曲线 (akshare)"
                        })
                    if res:
                        return res
            except Exception as e:
                logger.error(f"Error fetching CN bond yields for {date_str}: {e}")
                
        raise HTTPException(status_code=500, detail="Failed to fetch Chinese treasury yields from akshare")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Parquet export for DuckDB-Wasm (binary fetch) ---

@app.get("/api/data/snapshots.parquet")
def get_parquet():
    """Serve the full snapshot table as a Parquet file for DuckDB-Wasm HTTPFS loading."""
    try:
        import pandas as pd
        import io
        conn = _connect()
        df = pd.read_sql_query("SELECT * FROM snapshots ORDER BY snapshot_date, ticker", conn)
        conn.close()

        buf = io.BytesIO()
        df.to_parquet(buf, index=False)
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="application/octet-stream",
            headers={"Content-Disposition": "inline; filename=snapshots.parquet"}
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="pandas/pyarrow not installed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3010)
