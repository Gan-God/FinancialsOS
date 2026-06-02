import os
import json
import requests
import yfinance as yf
from datetime import datetime
import logging

# Configure basic logging to track offline fallbacks cleanly
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# Set up local cache directory to survive offline states
CACHE_DIR = ".cache"
CACHE_FILE = os.path.join(CACHE_DIR, "price_cache.json")

def _load_cache():
    """Loads the offline JSON cache if it exists."""
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return {}

def _save_cache(cache_data):
    """Saves live prices to the hidden local cache."""
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache_data, f, indent=4)

class MarketEngine:
    def __init__(self):
        self.cache = _load_cache()

    def get_mf_nav(self, scheme_code: str) -> dict:
        """
        Fetches live NAV from MFapi.in. 
        Returns dict containing {'price': float, 'name': str, 'date': str, 'status': str}
        """
        cache_key = f"MF_{scheme_code}"
        url = f"https://api.mfapi.in/mf/{scheme_code}/latest"
        
        try:
            # 10 second timeout prevents the app from hanging if internet drops
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            nav_data = {
                "price": float(data['data'][0]['nav']),
                "name": data['meta']['scheme_name'],
                "date": data['data'][0]['date'],
                "status": "LIVE"
            }
            
            # Update the local cache with fresh data
            self.cache[cache_key] = nav_data
            _save_cache(self.cache)
            return nav_data
            
        except (requests.RequestException, KeyError, IndexError) as e:
            # FAULT TOLERANCE: Fallback to the local JSON file
            logging.warning(f"Network failure for MF {scheme_code}. Attempting offline cache.")
            if cache_key in self.cache:
                fallback = self.cache[cache_key]
                fallback['status'] = "CACHED (OFFLINE)"
                return fallback
            else:
                logging.error(f"No cache available for {scheme_code}.")
                return {"price": 0.0, "name": f"Unknown Fund ({scheme_code})", "date": "N/A", "status": "ERROR"}

    def get_stock_price(self, ticker: str) -> dict:
        """
        Fetches live stock/ETF price from Yahoo Finance.
        Ensure Indian stocks end in '.NS' (NSE) or '.BO' (BSE).
        """
        cache_key = f"STOCK_{ticker}"
        
        try:
            asset = yf.Ticker(ticker)
            # Fetch 1 day of historical data to get the absolute latest close/live price
            history = asset.history(period="1d")
            
            if history.empty:
                raise ValueError(f"Yahoo Finance returned no data for {ticker}")
            
            latest_price = float(history['Close'].iloc[-1])
            name = asset.info.get('longName', ticker)
            
            stock_data = {
                "price": latest_price,
                "name": name,
                "date": datetime.now().strftime("%d-%m-%Y"),
                "status": "LIVE"
            }
            
            self.cache[cache_key] = stock_data
            _save_cache(self.cache)
            return stock_data
            
        except Exception as e:
            logging.warning(f"yfinance failure for {ticker}. Attempting offline cache.")
            if cache_key in self.cache:
                fallback = self.cache[cache_key]
                fallback['status'] = "CACHED (OFFLINE)"
                return fallback
            else:
                logging.error(f"No cache available for {ticker}.")
                return {"price": 0.0, "name": ticker, "date": "N/A", "status": "ERROR"}
