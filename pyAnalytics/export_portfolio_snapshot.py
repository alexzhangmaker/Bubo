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

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS account_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_date TEXT,
            accountID TEXT,
            totalCostCNY REAL,
            totalValueTTMCNY REAL,
            profitPercent REAL,
            lastAggregated TEXT,
            UNIQUE(snapshot_date, accountID)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS company_financials (
            ticker TEXT,                    -- 股票代碼 (例如: '0836.HK')
            company TEXT,                   -- 公司名稱 (例如: '華潤電力')
            year INTEGER,                   -- 年份
            operating_cash_flow REAL,       -- 經營活動現金流入淨額 (億港元)
            capital_expenditure REAL,       -- 現金資本開支 (億港元)
            free_cash_flow REAL,            -- 自由現金流估算 (億港元)
            interest_bearing_debt REAL,     -- 有息負債總額 (億港元)
            interest_expense REAL,          -- 利息支出/財務費用 (億港元)
            net_profit REAL,                -- 歸母淨利潤 (億港元)
            eps REAL,                       -- 每股基本盈利 (港元)
            dps REAL,                       -- 每股股息 (港元)
            specific_kpis TEXT,             -- 專有KPI (JSON格式，用於存儲不同公司/行業的專屬指標)
            PRIMARY KEY (ticker, year)      -- 聯合主鍵，確保同一家公司在同一年只有一條記錄
        )
    ''')

    today = datetime.now().strftime('%Y-%m-%d')
    print(f"Recording snapshot for {today}...")

    # 4. Enrich and Insert
    inserted_count = 0
    total_holdings_cny = 0.0

    for item in portfolio_data:
        ticker = item['ticker']
        info = sec_map.get(ticker, {})
        
        # Calculate market value in CNY
        shares = item.get('shares', 0)
        quote = item.get('quoteTTM', 0)
        ex_rate = item.get('exchangeRate', 1.0)
        total_value_cny = shares * quote * ex_rate
        total_holdings_cny += total_value_cny
        
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

    # Prepare data for account aggregation
    ticker_market_info = {}
    for item in portfolio_data:
        ticker_market_info[item['ticker']] = {
            'quoteTTM': item.get('quoteTTM', 0),
            'exRate': item.get('exchangeRate', 1.0)
        }

    account_totals = {}
    
    print(f"Fetching account assets from {ACCOUNTING_SERVICE_API}/assets...")
    try:
        resp = requests.get(f"{ACCOUNTING_SERVICE_API}/assets")
        resp.raise_for_status()
        assets_data = resp.json()
        
        for ast in assets_data:
            acc = ast.get('accountID', 'Unknown')
            t = ast.get('ticker')
            s = ast.get('shares', 0)
            cps = ast.get('costPerShare', 0)
            
            info = ticker_market_info.get(t, {'quoteTTM': 0, 'exRate': 1.0})
            rate = info['exRate']
            quote = info['quoteTTM']
            
            cost_cny = s * cps * rate
            val_cny = s * quote * rate
            
            if acc not in account_totals:
                account_totals[acc] = {'cost': 0.0, 'value': 0.0}
            
            account_totals[acc]['cost'] += cost_cny
            account_totals[acc]['value'] += val_cny
            
    except Exception as e:
        print(f"Warning: Failed to process assets: {e}")

    # 5. Fetch Other Assets and calculate Total Assets
    total_other_assets_cny = 0.0
    try:
        print(f"Fetching other assets from {ACCOUNTING_SERVICE_API}/other-assets...")
        resp = requests.get(f"{ACCOUNTING_SERVICE_API}/other-assets")
        if resp.ok:
            other_data = resp.json()
            for item in other_data:
                currency = item.get('currency', 'CNY')
                amount = item.get('amount', 0)
                ex_rate = 1.0
                if currency != 'CNY':
                    try:
                        ex_resp = requests.get(f"{MKT_SERVICE_API}/exrate/{currency}/CNY")
                        if ex_resp.ok:
                            ex_rate = ex_resp.json().get('rate', 1.0)
                    except:
                        pass
                
                val_cny = amount * ex_rate
                total_other_assets_cny += val_cny
                
                # Treat each other asset as a unique account using Name_ID
                other_acc_id = f"{item.get('assetName', 'OtherAsset')}_{item.get('id', '0')}"
                account_totals[other_acc_id] = {'cost': val_cny, 'value': val_cny}
    except Exception as e:
        print(f"Error fetching other assets: {e}")

    total_assets_cny = total_holdings_cny + total_other_assets_cny
    
    # Insert TOTAL_ASSETS row
    record_total = (
        today,
        'TOTAL_ASSETS',
        '总计账户资产',
        '-',
        '汇总',
        'CNY',
        1.0,
        total_assets_cny,
        total_assets_cny,
        total_assets_cny,
        1.0,
        total_assets_cny,
        0.0,
        datetime.now().isoformat()
    )
    cursor.execute('''
        INSERT OR REPLACE INTO snapshots (
            snapshot_date, ticker, name, country, type, currency, 
            shares, costPerShare, quoteTTM, totalCostCNY, exRate, 
            totalValueTTMCNY, earningPercent, lastAggregated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', record_total)
    inserted_count += 1

    # Insert account snapshots
    for acc_id, stats in account_totals.items():
        cost = stats['cost']
        val = stats['value']
        profit_pct = ((val / cost - 1) * 100) if cost > 0 else 0.0
        
        try:
            cursor.execute('''
                INSERT OR REPLACE INTO account_snapshots (
                    snapshot_date, accountID, totalCostCNY, totalValueTTMCNY, 
                    profitPercent, lastAggregated
                ) VALUES (?, ?, ?, ?, ?, ?)
            ''', (today, acc_id, cost, val, profit_pct, datetime.now().isoformat()))
            inserted_count += 1
        except Exception as e:
            print(f"Failed to record account {acc_id}: {e}")

    # Insert TOTAL_ASSETS for accounts
    total_cost_acc = sum(stats['cost'] for stats in account_totals.values())
    total_val_acc = sum(stats['value'] for stats in account_totals.values())
    total_acc_profit_pct = ((total_val_acc / total_cost_acc - 1) * 100) if total_cost_acc > 0 else 0.0
    
    cursor.execute('''
        INSERT OR REPLACE INTO account_snapshots (
            snapshot_date, accountID, totalCostCNY, totalValueTTMCNY, 
            profitPercent, lastAggregated
        ) VALUES (?, ?, ?, ?, ?, ?)
    ''', (today, 'TOTAL_ASSETS', total_cost_acc, total_val_acc, total_acc_profit_pct, datetime.now().isoformat()))
    inserted_count += 1

    conn.commit()
    conn.close()
    
    print(f"\nSuccessfully saved {inserted_count} records for {today} into {DB_FILE}.")

if __name__ == "__main__":
    main()
