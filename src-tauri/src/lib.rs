use serde::Serialize;

mod db;
mod market;

#[derive(Serialize)]
pub struct SimulationResult {
    optimal_sip: f64,
    true_fire_today: f64,
    nominal_target: f64,
    nominal_trajectory: Vec<f64>,
    real_trajectory: Vec<f64>,
}

fn parse_safe_float(s: &str, default: f64) -> f64 {
    s.parse::<f64>()
        .ok()
        .filter(|val| val.is_finite())
        .unwrap_or(default)
}

#[tauri::command]
fn calculate_fire(
    current_portfolio: String,
    lifestyle_cost: String,
    inflation_rate: String,
    nominal_cagr: String,
    step_up_rate: String,
    years: String,
    swr: String,
) -> Result<SimulationResult, String> {
    let cp = parse_safe_float(&current_portfolio, 0.0).max(0.0);
    let lc = parse_safe_float(&lifestyle_cost, 0.0).max(0.0);
    let ir = parse_safe_float(&inflation_rate, 0.0).max(0.0);
    let cagr = parse_safe_float(&nominal_cagr, 0.0).max(0.0);
    let sur = parse_safe_float(&step_up_rate, 0.0).max(0.0);
    let y = parse_safe_float(&years, 0.0).max(0.0);
    let s = parse_safe_float(&swr, 0.035).max(0.0001);

    if lc <= 0.0 {
        return Err("Monthly lifestyle cost must be greater than 0.".to_string());
    }
    if y <= 0.0 {
        return Err("Timeline (years) must be greater than 0.".to_string());
    }
    if s <= 0.0 {
        return Err("Safe Withdrawal Rate must be greater than 0.".to_string());
    }

    let true_fire_today = (lc * 12.0) / s;
    let nominal_target = true_fire_today * (1.0 + ir).powi(y as i32);
    let total_months = (y * 12.0) as i32;

    if total_months <= 0 {
        return Err("Calculated total months must be greater than 0.".to_string());
    }

    let run_simulation = |initial_sip: f64| -> (Vec<f64>, Vec<f64>) {
        let mut nominal_portfolio = Vec::with_capacity(total_months as usize);
        let mut real_portfolio = Vec::with_capacity(total_months as usize);

        let mut current_nominal = cp;

        for m in 1..=total_months {
            let current_year = ((m - 1) / 12) + 1;
            let current_sip = initial_sip * (1.0 + sur).powi(current_year - 1);

            current_nominal = (current_nominal + current_sip) * (1.0 + (cagr / 12.0));
            nominal_portfolio.push(current_nominal);

            let current_real = current_nominal / (1.0 + (ir / 12.0)).powi(m);
            real_portfolio.push(current_real);
        }

        (nominal_portfolio, real_portfolio)
    };

    // Use a dynamic upper bound to prevent clipping at 1,000,000 for high targets
    let mut low = 0.0;
    let mut high = true_fire_today.max(10_000_000.0);
    let mut optimal_sip = 0.0;

    for _ in 0..60 {
        let mid = (low + high) / 2.0;
        let (_, real_track) = run_simulation(mid);
        let final_real_wealth = real_track.last().unwrap_or(&0.0);

        if *final_real_wealth >= true_fire_today {
            optimal_sip = mid;
            high = mid;
        } else {
            low = mid;
        }
    }

    let (final_nominal, final_real) = run_simulation(optimal_sip);

    Ok(SimulationResult {
        optimal_sip: (optimal_sip * 100.0).round() / 100.0,
        true_fire_today,
        nominal_target,
        nominal_trajectory: final_nominal,
        real_trajectory: final_real,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            db::init_db(app.handle()).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            calculate_fire,
            db::get_assets,
            db::add_or_update_asset,
            db::remove_asset,
            db::get_cashflow,
            db::add_cashflow,
            db::remove_cashflow,
            market::get_resolved_portfolio,
            db::has_user,
            db::register_user,
            db::login_user
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
