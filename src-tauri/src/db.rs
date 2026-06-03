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

    let table_exists = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='assets'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if table_exists {
        let has_username_col = {
            let mut stmt = conn.prepare("PRAGMA table_info(assets)").ok();
            let mut found = false;
            if let Some(ref mut stmt) = stmt {
                if let Ok(mut rows) = stmt.query([]) {
                    while let Ok(Some(row)) = rows.next() {
                        if let Ok(col_name) = row.get::<_, String>(1) {
                            if col_name == "username" {
                                found = true;
                                break;
                            }
                        }
                    }
                }
            }
            found
        };

        if !has_username_col {
            let _ = conn.execute("DROP TABLE IF EXISTS assets", []);
            let _ = conn.execute("DROP TABLE IF EXISTS cashflow", []);
        }
    }

    // Create assets table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            code TEXT NOT NULL,
            units REAL NOT NULL,
            UNIQUE(username, code)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create assets table: {}", e))?;

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

    Ok(())
}

#[tauri::command]
pub fn get_assets(app_handle: tauri::AppHandle, username: String) -> Result<Vec<AssetItem>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();

    let mut stmt = conn
        .prepare("SELECT asset_type, code, units FROM assets WHERE username = ?1")
        .map_err(|e| format!("SQL preparation error: {}", e))?;

    let asset_iter = stmt
        .query_map(params![clean_user], |row| {
            Ok(AssetItem {
                asset_type: row.get(0)?,
                code: row.get(1)?,
                units: row.get(2)?,
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
pub fn add_or_update_asset(
    app_handle: tauri::AppHandle,
    username: String,
    asset_type: String,
    code: String,
    units: f64,
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
    if units < 0.0 {
        return Err("Units cannot be negative".to_string());
    }

    conn.execute(
        "INSERT OR REPLACE INTO assets (username, asset_type, code, units) VALUES (?1, ?2, ?3, ?4)",
        params![clean_user, asset_type.trim(), clean_code, units],
    )
    .map_err(|e| format!("Failed to insert or replace asset: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn remove_asset(app_handle: tauri::AppHandle, username: String, code: String) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;

    let clean_user = username.trim().to_lowercase();
    let clean_code = code.trim().to_uppercase();
    conn.execute("DELETE FROM assets WHERE username = ?1 AND code = ?2", params![clean_user, clean_code])
        .map_err(|e| format!("Failed to delete asset: {}", e))?;

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
