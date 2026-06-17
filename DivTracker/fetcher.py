import yfinance as yf
import akshare as ak
import pandas as pd
from datetime import datetime

def guess_currency(ticker: str) -> str:
    """Guess currency from ticker suffix."""
    if ticker.endswith('.HK'):
        return 'HKD'
    elif ticker.endswith('.L'):
        return 'GBP'
    elif ticker.endswith('.SS') or ticker.endswith('.SZ'):
        return 'CNY'
    else:
        return 'USD'

def fetch_ashare_dividends(ticker: str) -> list:
    """Fetch A-share dividend history using AKShare."""
    code = ticker.split('.')[0]
    records = []
    try:
        df = ak.stock_history_dividend_detail(symbol=code)
        if df is None or df.empty:
            return records
            
        for _, row in df.iterrows():
            # Check for ex-dividend date (除权除息日)
            ex_div_val = row.get('除权除息日')
            if pd.isna(ex_div_val):
                continue
                
            ex_div_date = pd.to_datetime(ex_div_val).strftime('%Y-%m-%d')
            
            announce_val = row.get('公告日期')
            announce_date = pd.to_datetime(announce_val).strftime('%Y-%m-%d') if not pd.isna(announce_val) else None
            
            record_val = row.get('股权登记日')
            record_date = pd.to_datetime(record_val).strftime('%Y-%m-%d') if not pd.isna(record_val) else None
            
            # For A-shares, payment date is typically the same as the ex-dividend date
            payment_date = ex_div_date
            
            # Amount: '派息' is per 10 shares, convert to per 1 share
            payout_10 = float(row.get('派息', 0))
            amount = payout_10 / 10.0
            
            # Only keep cash dividends
            if amount <= 0:
                continue
                
            progress = str(row.get('进度', ''))
            dividend_type = 'Final' if progress == '实施' else 'Proposed'
            
            records.append({
                'ticker': ticker,
                'ex_div_date': ex_div_date,
                'record_date': record_date,
                'payment_date': payment_date,
                'amount': amount,
                'currency': 'CNY',
                'dividend_type': dividend_type,
                'updated_at': datetime.now().isoformat()
            })
    except Exception as e:
        print(f"Error fetching A-share dividends for {ticker}: {e}")
        
    return records

def fetch_foreign_dividends(ticker: str) -> list:
    """Fetch US/HK/UK dividends using yfinance."""
    records = []
    try:
        t = yf.Ticker(ticker)
        try:
            divs = t.dividends
        except Exception as e:
            print(f"Error fetching dividends series for {ticker}: {e}")
            return records
            
        if divs is None or divs.empty:
            return records
            
        # Try fetching ticker info for currency and latest dates
        info = {}
        try:
            info = t.info
        except Exception as e:
            print(f"Warning: Failed to fetch info for {ticker} from yfinance: {e}")
            
        currency = info.get('currency') or guess_currency(ticker)
        
        latest_ex = None
        latest_pay = None
        
        # exDividendDate and dividendDate are timestamps
        if info.get('exDividendDate'):
            try:
                latest_ex = datetime.fromtimestamp(info.get('exDividendDate')).strftime('%Y-%m-%d')
            except Exception:
                pass
        if info.get('dividendDate'):
            try:
                latest_pay = datetime.fromtimestamp(info.get('dividendDate')).strftime('%Y-%m-%d')
            except Exception:
                pass
                
        for date_val, amount in divs.items():
            ex_div_date = date_val.strftime('%Y-%m-%d')
            amount = float(amount)
            if amount <= 0:
                continue
                
            # Determine or estimate payment date
            payment_date = None
            if latest_ex and ex_div_date == latest_ex:
                payment_date = latest_pay
                
            # Fallback estimation for payment date
            if not payment_date:
                try:
                    ex_dt = datetime.strptime(ex_div_date, '%Y-%m-%d')
                    if ticker.endswith('.HK'):
                        est_pay = ex_dt + pd.Timedelta(days=30)
                    else:
                        est_pay = ex_dt + pd.Timedelta(days=15)
                    payment_date = est_pay.strftime('%Y-%m-%d')
                except Exception:
                    payment_date = ex_div_date
                    
            # Estimate record date: 1 business day after ex-dividend date in US/HK
            record_date = None
            try:
                ex_dt = datetime.strptime(ex_div_date, '%Y-%m-%d')
                rec_dt = ex_dt + pd.Timedelta(days=1)
                record_date = rec_dt.strftime('%Y-%m-%d')
            except Exception:
                pass
                
            records.append({
                'ticker': ticker,
                'ex_div_date': ex_div_date,
                'record_date': record_date,
                'payment_date': payment_date,
                'amount': amount,
                'currency': currency,
                'dividend_type': 'Cash',
                'updated_at': datetime.now().isoformat()
            })
    except Exception as e:
        print(f"Error processing foreign dividends for {ticker}: {e}")
        
    return records

def fetch_dividend_history(ticker: str) -> list:
    """Fetch dividend history for a ticker (automatically delegates)."""
    if ticker.endswith('.SS') or ticker.endswith('.SZ'):
        return fetch_ashare_dividends(ticker)
    else:
        return fetch_foreign_dividends(ticker)
