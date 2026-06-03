use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

// We reuse the database modules
use crate::db;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResolvedAsset {
    #[serde(rename = "type")]
    pub asset_type: String,
    pub code: String,
    pub name: String,
    pub units: f64,
    pub price: f64,
    pub value: f64,
    pub date: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CacheEntry {
    pub price: f64,
    pub name: String,
    pub date: String,
}

// MFapi.in parsing structs
#[derive(Deserialize)]
struct MfMeta {
    scheme_name: String,
}

#[derive(Deserialize)]
struct MfDataPoint {
    date: String,
    nav: String,
}

#[derive(Deserialize)]
struct MfResponse {
    meta: MfMeta,
    data: Vec<MfDataPoint>,
}

// Yahoo Finance parsing structs
#[derive(Deserialize)]
struct YfMeta {
    symbol: String,
    #[serde(rename = "regularMarketPrice")]
    regular_market_price: Option<f64>,
}

#[derive(Deserialize)]
struct YfResult {
    meta: YfMeta,
}

#[derive(Deserialize)]
struct YfChart {
    result: Option<Vec<YfResult>>,
}

#[derive(Deserialize)]
struct YfResponse {
    chart: YfChart,
}

/// Resolves path to `price_cache.json` in the App Data Directory.
fn get_cache_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    Ok(app_dir.join("price_cache.json"))
}

/// Loads the price cache from disk.
fn load_cache(app_handle: &tauri::AppHandle) -> HashMap<String, CacheEntry> {
    if let Ok(path) = get_cache_path(app_handle) {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(cache) = serde_json::from_str::<HashMap<String, CacheEntry>>(&content) {
                    return cache;
                }
            }
        }
    }
    HashMap::new()
}

/// Saves the price cache to disk.
fn save_cache(app_handle: &tauri::AppHandle, cache: &HashMap<String, CacheEntry>) {
    if let Ok(path) = get_cache_path(app_handle) {
        if let Ok(content) = serde_json::to_string_pretty(cache) {
            let _ = fs::write(path, content);
        }
    }
}

/// Fetches Mutual Fund NAV from MFapi.in
async fn fetch_mf_nav(code: &str) -> Result<(f64, String, String), String> {
    let url = format!("https://api.mfapi.in/mf/{}/latest", code);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let body = response.json::<MfResponse>().await.map_err(|e| e.to_string())?;

    if body.data.is_empty() {
        return Err("No NAV data found in MFapi response".to_string());
    }

    let price = body.data[0].nav.parse::<f64>().map_err(|e| e.to_string())?;
    let name = body.meta.scheme_name;
    let date = body.data[0].date.clone();

    Ok((price, name, date))
}

/// Fetches Stock/ETF price from Yahoo Finance
async fn fetch_stock_price(ticker: &str) -> Result<(f64, String, String), String> {
    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?range=1d&interval=1d",
        ticker
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        // Yahoo Finance requires a User-Agent or it rejects requests
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let body = response.json::<YfResponse>().await.map_err(|e| e.to_string())?;

    let results = body
        .chart
        .result
        .ok_or_else(|| "No results returned in chart".to_string())?;
    
    if results.is_empty() {
        return Err("Yahoo Finance returned empty result list".to_string());
    }

    let meta = &results[0].meta;
    let price = meta
        .regular_market_price
        .ok_or_else(|| "Price field missing in meta".to_string())?;
    
    let name = meta.symbol.clone();
    let date = chrono::Local::now().format("%d-%m-%Y").to_string();

    Ok((price, name, date))
}

#[tauri::command]
pub async fn get_resolved_portfolio(app_handle: tauri::AppHandle, username: String) -> Result<Vec<ResolvedAsset>, String> {
    // 1. Fetch saved assets from database
    let assets = db::get_assets(app_handle.clone(), username.clone())?;

    // 2. Load cache
    let mut cache = load_cache(&app_handle);
    let mut resolved_assets = Vec::new();
    let mut cache_dirty = false;

    for asset in assets {
        let cache_key = format!("{}_{}", asset.asset_type, asset.code);
        let mut resolved_price = 0.0;
        let mut resolved_name = asset.code.clone();
        let mut resolved_date = "N/A".to_string();
        let status: String;

        // 3. Attempt live fetch
        let fetch_result = if asset.asset_type == "MF" {
            fetch_mf_nav(&asset.code).await
        } else {
            fetch_stock_price(&asset.code).await
        };

        match fetch_result {
            Ok((price, name, date)) => {
                resolved_price = price;
                resolved_name = name;
                resolved_date = date;
                status = "LIVE".to_string();

                // Save to cache
                cache.insert(
                    cache_key.clone(),
                    CacheEntry {
                        price,
                        name: resolved_name.clone(),
                        date: resolved_date.clone(),
                    },
                );
                cache_dirty = true;
            }
            Err(err) => {
                eprintln!("Failed to fetch live price for {}: {}. Attempting cache fallback.", asset.code, err);
                
                // Fallback to cache
                if let Some(cached) = cache.get(&cache_key) {
                    resolved_price = cached.price;
                    resolved_name = cached.name.clone();
                    resolved_date = cached.date.clone();
                    status = "CACHED (OFFLINE)".to_string();
                } else {
                    status = format!("ERROR: {}", err);
                }
            }
        }

        let value = resolved_price * asset.units;

        resolved_assets.push(ResolvedAsset {
            asset_type: asset.asset_type,
            code: asset.code,
            name: resolved_name,
            units: asset.units,
            price: resolved_price,
            value,
            date: resolved_date,
            status,
        });
    }

    // 4. Save cache back if it has been updated
    if cache_dirty {
        save_cache(&app_handle, &cache);
    }

    Ok(resolved_assets)
}
