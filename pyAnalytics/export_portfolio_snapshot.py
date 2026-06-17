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
            account_type TEXT,
            totalCostCNY REAL,
            totalValueTTMCNY REAL,
            profitPercent REAL,
            cashCNY REAL DEFAULT 0,
            securitiesValueCNY REAL DEFAULT 0,
            securitiesCostCNY REAL DEFAULT 0,
            liabilitiesCNY REAL DEFAULT 0,
            netAssetsCNY REAL DEFAULT 0,
            details TEXT,
            lastAggregated TEXT,
            UNIQUE(snapshot_date, accountID)
        )
    ''')

    # Ensure columns exist dynamically
    cursor.execute("PRAGMA table_info(account_snapshots)")
    cols = [r[1] for r in cursor.fetchall()]
    for col_name in ['cashCNY', 'securitiesValueCNY', 'securitiesCostCNY', 'liabilitiesCNY', 'netAssetsCNY']:
        if col_name not in cols:
            cursor.execute(f"ALTER TABLE account_snapshots ADD COLUMN {col_name} REAL DEFAULT 0")
    if 'details' not in cols:
        cursor.execute("ALTER TABLE account_snapshots ADD COLUMN details TEXT")
    if 'account_type' not in cols:
        cursor.execute("ALTER TABLE account_snapshots ADD COLUMN account_type TEXT")

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

    # Prepare data for account aggregation using Balance Sheet endpoint
    account_totals = {}
    total_cash = []
    total_securities = []
    total_liabilities = []

    print(f"Fetching balance sheet from {ACCOUNTING_SERVICE_API}/balance-sheet...")
    balance_sheet_accounts = []
    try:
        resp = requests.get(f"{ACCOUNTING_SERVICE_API}/balance-sheet")
        resp.raise_for_status()
        bs_data = resp.json()
        balance_sheet_accounts = bs_data.get('accounts', [])
    except Exception as e:
        print(f"Warning: Failed to fetch balance sheet: {e}")

    for acc in balance_sheet_accounts:
        acc_id = acc['accountID']
        totals = acc['totals']
        
        cash_cny = totals.get('cashInCNY', 0.0)
        sec_val_cny = totals.get('securitiesValueInCNY', 0.0)
        sec_cost_cny = totals.get('securitiesCostInCNY', 0.0)
        liab_cny = totals.get('liabilitiesInCNY', 0.0)
        net_cny = totals.get('netAssetsInCNY', 0.0)
        profit_pct = totals.get('profitLossPercent', 0.0)

        # Collect consolidated lists
        total_cash.extend(acc.get('cash', []))
        total_securities.extend(acc.get('securities', []))
        total_liabilities.extend(acc.get('liabilities', []))

        # Store detailed list as JSON
        details_data = {
            'cash': acc.get('cash', []),
            'securities': acc.get('securities', []),
            'liabilities': acc.get('liabilities', [])
        }
        details_json = json.dumps(details_data)

        # For backward compatibility, totalValueTTMCNY acts as total assets, and totalCostCNY acts as cost + cash
        account_totals[acc_id] = {
            'account_type': 'securities',
            'cashCNY': cash_cny,
            'securitiesValueCNY': sec_val_cny,
            'securitiesCostCNY': sec_cost_cny,
            'liabilitiesCNY': liab_cny,
            'netAssetsCNY': net_cny,
            'cost': sec_cost_cny + cash_cny,
            'value': sec_val_cny + cash_cny,
            'profitPercent': profit_pct,
            'details': details_json
        }

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
                category = item.get('assetCategory', '其他')
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
                is_cash = (category == '现金')

                # Structure details for other assets
                other_details = {
                    'cash': [],
                    'securities': [],
                    'liabilities': []
                }
                if is_cash:
                    c_item = {
                        'currency': currency,
                        'amount': amount,
                        'amountInCNY': val_cny,
                        'exchangeRate': ex_rate
                    }
                    other_details['cash'].append(c_item)
                    total_cash.append(c_item)
                else:
                    s_item = {
                        'ticker': item.get('assetName', 'OtherAsset'),
                        'assetType': category,
                        'currency': currency,
                        'shares': 1.0,
                        'costPerShare': amount,
                        'totalCost': amount,
                        'totalCostInCNY': val_cny,
                        'marketPrice': amount,
                        'marketValue': amount,
                        'marketValueInCNY': val_cny,
                        'exchangeRate': ex_rate,
                        'profitLossCNY': 0.0,
                        'profitLossPercent': 0.0
                    }
                    other_details['securities'].append(s_item)
                    total_securities.append(s_item)

                account_totals[other_acc_id] = {
                    'account_type': 'other',
                    'cashCNY': val_cny if is_cash else 0.0,
                    'securitiesValueCNY': 0.0 if is_cash else val_cny,
                    'securitiesCostCNY': 0.0 if is_cash else val_cny,
                    'liabilitiesCNY': 0.0,
                    'netAssetsCNY': val_cny,
                    'cost': val_cny,
                    'value': val_cny,
                    'profitPercent': 0.0,
                    'details': json.dumps(other_details)
                }
    except Exception as e:
        print(f"Error fetching other assets: {e}")

    total_assets_cny = total_holdings_cny + total_other_assets_cny
    
    # Insert TOTAL_ASSETS row in snapshots
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
        try:
            cursor.execute('''
                INSERT OR REPLACE INTO account_snapshots (
                    snapshot_date, accountID, account_type, totalCostCNY, totalValueTTMCNY, 
                    profitPercent, cashCNY, securitiesValueCNY, securitiesCostCNY, 
                    liabilitiesCNY, netAssetsCNY, details, lastAggregated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                today, acc_id, stats.get('account_type', 'securities'), stats['cost'], stats['value'], stats['profitPercent'],
                stats['cashCNY'], stats['securitiesValueCNY'], stats['securitiesCostCNY'],
                stats['liabilitiesCNY'], stats['netAssetsCNY'], stats.get('details', '{}'), datetime.now().isoformat()
            ))
            inserted_count += 1
        except Exception as e:
            print(f"Failed to record account {acc_id}: {e}")

    # Insert TOTAL_ASSETS for accounts
    total_cost_acc = sum(s['cost'] for s in account_totals.values())
    total_val_acc = sum(s['value'] for s in account_totals.values())
    
    total_cash_acc = sum(s['cashCNY'] for s in account_totals.values())
    total_sec_val_acc = sum(s['securitiesValueCNY'] for s in account_totals.values())
    total_sec_cost_acc = sum(s['securitiesCostCNY'] for s in account_totals.values())
    total_liab_acc = sum(s['liabilitiesCNY'] for s in account_totals.values())
    total_net_acc = sum(s['netAssetsCNY'] for s in account_totals.values())
    total_acc_profit_pct = ((total_sec_val_acc / total_sec_cost_acc - 1) * 100) if total_sec_cost_acc > 0 else 0.0
    
    total_details_json = json.dumps({
        'cash': total_cash,
        'securities': total_securities,
        'liabilities': total_liabilities
    })

    try:
        cursor.execute('''
            INSERT OR REPLACE INTO account_snapshots (
                snapshot_date, accountID, account_type, totalCostCNY, totalValueTTMCNY, 
                profitPercent, cashCNY, securitiesValueCNY, securitiesCostCNY, 
                liabilitiesCNY, netAssetsCNY, details, lastAggregated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            today, 'TOTAL_ASSETS', 'total', total_cost_acc, total_val_acc, total_acc_profit_pct,
            total_cash_acc, total_sec_val_acc, total_sec_cost_acc,
            total_liab_acc, total_net_acc, total_details_json, datetime.now().isoformat()
        ))
        inserted_count += 1
    except Exception as e:
        print(f"Failed to record TOTAL_ASSETS account: {e}")

    conn.commit()
    conn.close()
    
    print(f"\nSuccessfully saved {inserted_count} records for {today} into {DB_FILE}.")

if __name__ == "__main__":
    main()
