use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AssetItem {
    #[serde(rename = "type")]
    pub asset_type: String,
    pub code: String,
    pub units: f64,
    pub avg_buy_price: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CashflowItem {
    pub id: i64,
    pub category: String,
    pub description: Option<String>,
    pub amount: f64,
    pub flow_type: String,
    pub date: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SettingsItem {
    pub username: String,
    pub gemini_api_key: Option<String>,
    pub inflation_rate: f64,
    pub nominal_cagr: f64,
    pub step_up_rate: f64,
    pub swr: f64,
    pub pan_number: Option<String>,
    pub pan_name: Option<String>,
    pub theme: Option<String>,
    pub system_instruction: Option<String>,
    pub custom_prompt: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TransactionItem {
    pub id: i64,
    pub asset_type: String,
    pub code: String,
    pub buy_price: f64,
    pub units: f64,
    pub purchase_date: String,
}

/// Resolves the absolute path to the SQLite database file and ensures the parent folder exists.
fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    // Create directory if it doesn't exist
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    Ok(app_dir.join("portfolio.db"))
}

/// Connects to the database and initializes tables if they don't exist.
pub fn init_db(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let db_path = get_db_path(app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    // Create users table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create users table: {}", e))?;

    // Create settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            username TEXT PRIMARY KEY,
            gemini_api_key TEXT,
            inflation_rate REAL NOT NULL,
            nominal_cagr REAL NOT NULL,
            step_up_rate REAL NOT NULL,
            swr REAL NOT NULL,
            pan_number TEXT,
            pan_name TEXT,
            theme TEXT,
            system_instruction TEXT,
            custom_prompt TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create settings table: {}", e))?;

    // Alter table to add PAN, theme, and AI columns if they are not already there
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN pan_number TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN pan_name TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN theme TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN system_instruction TEXT", []);
    let _ = conn.execute("ALTER TABLE settings ADD COLUMN custom_prompt TEXT", []);

    // Create cashflow table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cashflow (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            amount REAL NOT NULL,
            flow_type TEXT NOT NULL,
            date TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create cashflow table: {}", e))?;

    // Create asset_transactions table (Replacing the legacy aggregate assets table)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            code TEXT NOT NULL,
            buy_price REAL NOT NULL,
            units REAL NOT NULL,
            purchase_date TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create asset_transactions table: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_assets(app_handle: tauri::AppHandle, username: String) -> Result<Vec<AssetItem>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();

    // Dynamically calculate units and weighted average buy price on the fly
    let mut stmt = conn
        .prepare(
            "SELECT asset_type, code, SUM(units), SUM(units * buy_price) / SUM(units) 
             FROM asset_transactions 
             WHERE username = ?1 
             GROUP BY code"
        )
        .map_err(|e| format!("SQL preparation error: {}", e))?;

    let asset_iter = stmt
        .query_map(params![clean_user], |row| {
            let units: f64 = row.get(2)?;
            let avg_buy_price: f64 = row.get(3)?;
            Ok(AssetItem {
                asset_type: row.get(0)?,
                code: row.get(1)?,
                units,
                avg_buy_price,
            })
        })
        .map_err(|e| format!("SQL query execution error: {}", e))?;

    let mut assets = Vec::new();
    for asset in asset_iter {
        assets.push(asset.map_err(|e| format!("Row processing error: {}", e))?);
    }

    Ok(assets)
}

#[tauri::command]
pub fn get_transactions(app_handle: tauri::AppHandle, username: String, code: String) -> Result<Vec<TransactionItem>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    let clean_code = code.trim().to_uppercase();

    let mut stmt = conn
        .prepare(
            "SELECT id, asset_type, code, buy_price, units, purchase_date 
             FROM asset_transactions 
             WHERE username = ?1 AND code = ?2 
             ORDER BY purchase_date DESC"
        )
        .map_err(|e| format!("SQL preparation error: {}", e))?;

    let tx_iter = stmt
        .query_map(params![clean_user, clean_code], |row| {
            Ok(TransactionItem {
                id: row.get(0)?,
                asset_type: row.get(1)?,
                code: row.get(2)?,
                buy_price: row.get(3)?,
                units: row.get(4)?,
                purchase_date: row.get(5)?,
            })
        })
        .map_err(|e| format!("SQL query execution error: {}", e))?;

    let mut txs = Vec::new();
    for tx in tx_iter {
        txs.push(tx.map_err(|e| format!("Row processing error: {}", e))?);
    }

    Ok(txs)
}

#[tauri::command]
pub fn add_transaction(
    app_handle: tauri::AppHandle,
    username: String,
    asset_type: String,
    code: String,
    buy_price: f64,
    units: f64,
    purchase_date: String,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    let clean_code = code.trim().to_uppercase();

    if clean_user.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if clean_code.is_empty() {
        return Err("Asset code cannot be empty".to_string());
    }
    if buy_price <= 0.0 {
        return Err("Buy price must be greater than 0".to_string());
    }
    if units <= 0.0 {
        return Err("Units must be greater than 0".to_string());
    }

    conn.execute(
        "INSERT INTO asset_transactions (username, asset_type, code, buy_price, units, purchase_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![clean_user, asset_type.trim(), clean_code, buy_price, units, purchase_date.trim()],
    )
    .map_err(|e| format!("Failed to insert transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn remove_transaction(app_handle: tauri::AppHandle, username: String, id: i64) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();

    conn.execute("DELETE FROM asset_transactions WHERE username = ?1 AND id = ?2", params![clean_user, id])
        .map_err(|e| format!("Failed to delete transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_cashflow(app_handle: tauri::AppHandle, username: String) -> Result<Vec<CashflowItem>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();

    let mut stmt = conn
        .prepare("SELECT id, category, description, amount, flow_type, date FROM cashflow WHERE username = ?1 ORDER BY date DESC")
        .map_err(|e| format!("SQL preparation error: {}", e))?;

    let cashflow_iter = stmt
        .query_map(params![clean_user], |row| {
            Ok(CashflowItem {
                id: row.get(0)?,
                category: row.get(1)?,
                description: row.get(2)?,
                amount: row.get(3)?,
                flow_type: row.get(4)?,
                date: row.get(5)?,
            })
        })
        .map_err(|e| format!("SQL query execution error: {}", e))?;

    let mut items = Vec::new();
    for item in cashflow_iter {
        items.push(item.map_err(|e| format!("Row processing error: {}", e))?);
    }

    Ok(items)
}

#[tauri::command]
pub fn add_cashflow(
    app_handle: tauri::AppHandle,
    username: String,
    category: String,
    description: Option<String>,
    amount: f64,
    flow_type: String,
    date: String,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    if clean_user.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if category.trim().is_empty() {
        return Err("Category cannot be empty".to_string());
    }
    if amount <= 0.0 {
        return Err("Amount must be greater than 0".to_string());
    }

    conn.execute(
        "INSERT INTO cashflow (username, category, description, amount, flow_type, date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            clean_user,
            category.trim(),
            description.map(|d| d.trim().to_string()),
            amount,
            flow_type.trim().to_uppercase(),
            date.trim()
        ],
    )
    .map_err(|e| format!("Failed to insert cashflow entry: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn remove_cashflow(app_handle: tauri::AppHandle, username: String, id: i64) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    conn.execute("DELETE FROM cashflow WHERE username = ?1 AND id = ?2", params![clean_user, id])
        .map_err(|e| format!("Failed to delete cashflow entry: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_settings(app_handle: tauri::AppHandle, username: String) -> Result<Option<SettingsItem>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();

    let mut stmt = conn
        .prepare("SELECT username, gemini_api_key, inflation_rate, nominal_cagr, step_up_rate, swr, pan_number, pan_name, theme, system_instruction, custom_prompt FROM settings WHERE username = ?1")
        .map_err(|e| format!("SQL preparation error: {}", e))?;

    let mut rows = stmt
        .query(params![clean_user])
        .map_err(|e| format!("SQL query execution error: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| format!("Row fetching error: {}", e))? {
        let username: String = row.get(0).map_err(|e| e.to_string())?;
        let gemini_api_key: Option<String> = row.get(1).map_err(|e| e.to_string())?;
        let inflation_rate: f64 = row.get(2).map_err(|e| e.to_string())?;
        let nominal_cagr: f64 = row.get(3).map_err(|e| e.to_string())?;
        let step_up_rate: f64 = row.get(4).map_err(|e| e.to_string())?;
        let swr: f64 = row.get(5).map_err(|e| e.to_string())?;
        let pan_number: Option<String> = row.get(6).map_err(|e| e.to_string())?;
        let pan_name: Option<String> = row.get(7).map_err(|e| e.to_string())?;
        let theme: Option<String> = row.get(8).map_err(|e| e.to_string())?;
        let system_instruction: Option<String> = row.get(9).map_err(|e| e.to_string())?;
        let custom_prompt: Option<String> = row.get(10).map_err(|e| e.to_string())?;

        Ok(Some(SettingsItem {
            username,
            gemini_api_key,
            inflation_rate,
            nominal_cagr,
            step_up_rate,
            swr,
            pan_number,
            pan_name,
            theme,
            system_instruction,
            custom_prompt,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn save_settings(
    app_handle: tauri::AppHandle,
    username: String,
    gemini_api_key: Option<String>,
    inflation_rate: f64,
    nominal_cagr: f64,
    step_up_rate: f64,
    swr: f64,
    pan_number: Option<String>,
    pan_name: Option<String>,
    theme: Option<String>,
    system_instruction: Option<String>,
    custom_prompt: Option<String>,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    if clean_user.is_empty() {
        return Err("Username cannot be empty".to_string());
    }

    let clean_key = gemini_api_key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty());
    let clean_pan_number = pan_number.map(|p| p.trim().to_uppercase().to_string()).filter(|p| !p.is_empty());
    let clean_pan_name = pan_name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let clean_theme = theme.map(|t| t.trim().to_lowercase().to_string()).filter(|t| !t.is_empty());
    let clean_system_instruction = system_instruction.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let clean_custom_prompt = custom_prompt.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());

    conn.execute(
        "INSERT OR REPLACE INTO settings (username, gemini_api_key, inflation_rate, nominal_cagr, step_up_rate, swr, pan_number, pan_name, theme, system_instruction, custom_prompt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            clean_user,
            clean_key,
            inflation_rate,
            nominal_cagr,
            step_up_rate,
            swr,
            clean_pan_number,
            clean_pan_name,
            clean_theme,
            clean_system_instruction,
            clean_custom_prompt
        ],
    )
    .map_err(|e| format!("Failed to save settings: {}", e))?;

    Ok(())
}

use sha2::{Digest, Sha256};

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

#[tauri::command]
pub fn has_user(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| format!("SQL query error: {}", e))?;

    Ok(count > 0)
}

#[tauri::command]
pub fn register_user(
    app_handle: tauri::AppHandle,
    username: String,
    password_raw: String,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    if clean_user.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if password_raw.len() < 4 {
        return Err("Password must be at least 4 characters long".to_string());
    }

    let hash = hash_password(&password_raw);

    conn.execute(
        "INSERT OR REPLACE INTO users (username, password_hash) VALUES (?1, ?2)",
        params![clean_user, hash],
    )
    .map_err(|e| format!("Failed to register user: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn login_user(
    app_handle: tauri::AppHandle,
    username: String,
    password_raw: String,
) -> Result<bool, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    let hash = hash_password(&password_raw);

    let mut stmt = conn
        .prepare("SELECT password_hash FROM users WHERE username = ?1")
        .map_err(|e| format!("SQL preparation error: {}", e))?;

    let mut rows = stmt
        .query(params![clean_user])
        .map_err(|e| format!("SQL query error: {}", e))?;

    if let Some(row) = rows.next().map_err(|e| format!("Row error: {}", e))? {
        let db_hash: String = row.get(0).map_err(|e| format!("Get field error: {}", e))?;
        Ok(db_hash == hash)
    } else {
        Ok(false)
    }
}
