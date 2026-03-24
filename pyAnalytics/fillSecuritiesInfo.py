import yfinance as yf
import requests
import json
import time

MKT_SERVICE_API = "http://localhost:3009/api"

def main():
    """
    Enriches MktService SecuritiesInfo by fetching metadata from yfinance
    for all tickers currently in the MarketData table.
    """
    # 1. Get tickers from MktService
    try:
        print(f"Fetching tickers from {MKT_SERVICE_API}/market...")
        response = requests.get(f"{MKT_SERVICE_API}/market")
        response.raise_for_status()
        rows = response.json()
        # Extract unique tickers
        tickers = sorted(list(set([r['ticker'] for r in rows])))
    except Exception as e:
        print(f"Error fetching tickers: {e}")
        return

    if not tickers:
        print("No tickers found in MarketData table.")
        return

    print(f"Found {len(tickers)} unique tickers. Starting enrichment...")

    for ticker in tickers:
        try:
            print(f"\n--- Processing {ticker} ---")
            
            # Special handling for virtual bond tickers
            if ticker.upper() in ['US-GOVT', 'US-GOVT-2']:
                payload = {
                    "ticker": ticker.upper(),
                    "companyName": "US Government Bond",
                    "listingCountry": "United States",
                    "currency": "USD",
                    "assetType": "Bond",
                    "tags": ["Bond", "Sovereign", "Fixed Income"]
                }
                print(f"Manual Enrichment: {payload['companyName']} (Bond)")
            else:
                # Create yfinance ticker object
                yt = yf.Ticker(ticker)
                
                # Retrieve metadata info
                info = yt.info
                
                if not info or len(info) < 5:
                    print(f"Warning: Limited data found for {ticker}")

                # Map yfinance info to MktService SecuritiesInfo schema
                company_name = info.get('longName') or info.get('shortName') or info.get('name') or ticker
                country = info.get('country', 'Unknown')
                currency = info.get('currency', 'Unknown')
                asset_type = info.get('quoteType', 'Stock')
                
                # Build tags from various categories
                tags = []
                for field in ['sector', 'industry', 'exchange', 'market', 'quoteType']:
                    val = info.get(field)
                    if val and val not in tags:
                        tags.append(val)
                
                payload = {
                    "ticker": ticker,
                    "companyName": company_name,
                    "listingCountry": country,
                    "currency": currency,
                    "assetType": asset_type,
                    "tags": tags
                }
                print(f"Enriched: {company_name} | {asset_type} | {currency} | {country}")
            
            # 2. Save/Update back to MktService via API
            post_res = requests.post(f"{MKT_SERVICE_API}/securities", json=payload)
            post_res.json() # Consume response
            post_res.raise_for_status()
            
            print(f"Successfully synchronized {ticker} to MktService.")
            
            # Politeness delay
            time.sleep(1.2)
            
        except Exception as e:
            print(f"Failed to enrich {ticker}: {e}")

    print("\n" + "="*40)
    print("Securities Metadata Sync Completed.")
    print("="*40)

if __name__ == "__main__":
    main()
