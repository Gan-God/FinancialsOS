import sqlite3
import pandas as pd
import os

DB_FILE = "portfolio.db"

def init_db():
    """Creates the SQLite database and assets table if they do not exist."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_type TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            units REAL NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def add_or_update_asset(asset_type: str, code: str, units: float):
    """Inserts a new asset or updates the units if the ticker/code already exists."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # UPSERT logic: If code exists, replace the row with updated units
    cursor.execute('''
        INSERT OR REPLACE INTO assets (asset_type, code, units) 
        VALUES (?, ?, ?)
    ''', (asset_type, code.upper(), units))
    conn.commit()
    conn.close()

def remove_asset(code: str):
    """Deletes an asset from the database."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM assets WHERE code = ?', (code.upper(),))
    conn.commit()
    conn.close()

def get_all_assets() -> list:
    """Fetches all assets and returns them as a list of dictionaries."""
    if not os.path.exists(DB_FILE):
        init_db()
        
    conn = sqlite3.connect(DB_FILE)
    # Use pandas to quickly map SQL rows to a list of dicts
    df = pd.read_sql_query("SELECT asset_type as type, code, units FROM assets", conn)
    conn.close()
    return df.to_dict('records')
