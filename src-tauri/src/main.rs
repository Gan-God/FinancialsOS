// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

// This struct defines the exact data shape we will send to the React frontend
#[derive(Serialize)]
pub struct SimulationResult {
    optimal_sip: f64,
    true_fire_today: f64,
    nominal_target: f64,
    nominal_trajectory: Vec<f64>,
    real_trajectory: Vec<f64>,
}

// The core calculus engine exposed to the UI
#[tauri::command]
fn calculate_fire(
    current_portfolio: f64,
    lifestyle_cost: f64,
    inflation_rate: f64,
    nominal_cagr: f64,
    step_up_rate: f64,
    years: i32,
    swr: f64,
) -> SimulationResult {
    // 1. Core Target Calculations
    let true_fire_today = (lifestyle_cost * 12.0) / swr;
    let nominal_target = true_fire_today * (1.0 + inflation_rate).powi(years);
    let total_months = years * 12;

    // Helper closure to run the continuous trajectory simulation
    let run_simulation = |initial_sip: f64| -> (Vec<f64>, Vec<f64>) {
        let mut nominal_portfolio = Vec::with_capacity(total_months as usize);
        let mut real_portfolio = Vec::with_capacity(total_months as usize);

        let mut current_nominal = current_portfolio;

        for m in 1..=total_months {
            let current_year = ((m - 1) / 12) + 1;

            // Step function: Escalate SIP annually
            let current_sip = initial_sip * (1.0 + step_up_rate).powi(current_year - 1);

            // Compound nominal growth path
            current_nominal = (current_nominal + current_sip) * (1.0 + (nominal_cagr / 12.0));
            nominal_portfolio.push(current_nominal);

            // Strip away continuous currency degradation
            let current_real = current_nominal / (1.0 + (inflation_rate / 12.0)).powi(m);
            real_portfolio.push(current_real);
        }

        (nominal_portfolio, real_portfolio)
    };

    // 2. Binary Search Optimization to find the exact starting SIP
    let mut low = 0.0;
    let mut high = 1_000_000.0; // 10 Lakhs/month upper boundary search space
    let mut optimal_sip = 0.0;

    // 60 iterations guarantees sub-paise precision
    for _ in 0..60 {
        let mid = (low + high) / 2.0;
        let (_, real_track) = run_simulation(mid);
        let final_real_wealth = real_track.last().unwrap_or(&0.0);

        if *final_real_wealth >= true_fire_today {
            optimal_sip = mid;
            high = mid; // Try to find a tighter, lower valid amount
        } else {
            low = mid; // Target missed, need to invest more
        }
    }

    // 3. Generate the final exact trajectories for the optimal SIP
    let (final_nominal, final_real) = run_simulation(optimal_sip);

    SimulationResult {
        optimal_sip: (optimal_sip * 100.0).round() / 100.0, // Round to 2 decimals
        true_fire_today,
        nominal_target,
        nominal_trajectory: final_nominal,
        real_trajectory: final_real,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Register the Rust function so the React UI can call it
        .invoke_handler(tauri::generate_handler![calculate_fire])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
