import sqlite3
import requests
import json
from datetime import datetime
import os

# Configuration
ACCOUNTING_SERVICE_API = "http://localhost:3008/api"
MKT_SERVICE_API = "http://localhost:3009/api"
DB_FILE = "portfolio_history.sqlite"

def main():
    # 1. Fetch Portfolio Data from AccountingService
    try:
        print(f"Fetching portfolio data from {ACCOUNTING_SERVICE_API}/portfolio/data...")
        resp = requests.get(f"{ACCOUNTING_SERVICE_API}/portfolio/data")
        resp.raise_for_status()
        portfolio_data = resp.json()
    except Exception as e:
        print(f"Error fetching portfolio data: {e}")
        return

    if not portfolio_data:
        print("No portfolio entries found.")
        return

    # 2. Fetch Securities Metadata from MktService
    sec_map = {}
    try:
        print(f"Fetching securities metadata from {MKT_SERVICE_API}/securities...")
        resp = requests.get(f"{MKT_SERVICE_API}/securities")
        resp.raise_for_status()
        sec_data = resp.json()
        for s in sec_data:
            sec_map[s['ticker']] = s
    except Exception as e:
        print(f"Warning: Failed to fetch securities info: {e}")

    # 3. Setup SQLite for Snapshots
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_date TEXT,
            ticker TEXT,
            name TEXT,
            country TEXT,
            type TEXT,
            currency TEXT,
            shares REAL,
            costPerShare REAL,
            quoteTTM REAL,
            totalCostCNY REAL,
            exRate REAL,
            totalValueTTMCNY REAL,
            earningPercent REAL,
            lastAggregated TEXT,
            UNIQUE(snapshot_date, ticker)
        )
    ''')

    today = datetime.now().strftime('%Y-%m-%d')
    print(f"Recording snapshot for {today}...")

    # 4. Enrich and Insert
    inserted_count = 0
    for item in portfolio_data:
        ticker = item['ticker']
        info = sec_map.get(ticker, {})
        
        # Calculate market value in CNY
        shares = item.get('shares', 0)
        quote = item.get('quoteTTM', 0)
        ex_rate = item.get('exchangeRate', 1.0)
        total_value_cny = shares * quote * ex_rate
        
        record = (
            today,
            ticker,
            info.get('companyName', '-'),
            info.get('listingCountry', '-'),
            info.get('assetType', '-'),
            item.get('currency', '-'),
            shares,
            item.get('costPerShare', 0),
            quote,
            item.get('totalCostInCNY', 0),
            ex_rate,
            total_value_cny,
            item.get('earningInPercent', 0),
            item.get('datetime', '-')
        )
        
        try:
            cursor.execute('''
                INSERT OR REPLACE INTO snapshots (
                    snapshot_date, ticker, name, country, type, currency, 
                    shares, costPerShare, quoteTTM, totalCostCNY, exRate, 
                    totalValueTTMCNY, earningPercent, lastAggregated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', record)
            inserted_count += 1
        except Exception as e:
            print(f"Failed to record {ticker}: {e}")

    conn.commit()
    conn.close()
    
    print(f"\nSuccessfully saved {inserted_count} records for {today} into {DB_FILE}.")

if __name__ == "__main__":
    main()
