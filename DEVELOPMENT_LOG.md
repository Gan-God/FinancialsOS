# FinancialsOS: Development Logbook

## [Phase 1] Architecture Pivot & Security Lockdown
**Objective:** Transition from a loosely coupled script prototype to a secure, compiled desktop executable.

* **The Python Prototype:** Initially built the continuous calculus FIRE simulation using Python (Streamlit + Pandas). While mathematically accurate, running a local Python server is not viable for a frictionless end-user desktop product.
* **Security & Licensing:** Moved away from the MIT license to a strict Proprietary ("All Rights Reserved") license to protect the core intellectual property. Transitioned local Git authentication from HTTPS to cryptographic SSH (Ed25519) for secure repository management.
* **The Tauri Pivot:** Adopted the Tauri framework (Rust backend + React/TypeScript frontend). 
    * *Why Tauri over Electron?* By binding to the native OS webview (WebKitGTK on Fedora/Linux), the application will consume a fraction of the RAM while maintaining C-level execution speeds via the Rust backend. 

## [Phase 2] The Rust Calculus Engine
**Objective:** Port the non-linear differential math and binary search optimization loop from Python into a high-performance Rust backend.
* Completed porting the Continuous Calculus Horizon simulator in Rust.
* Validated parameters string passing to avoid JS/Rust float serialization limits.

## [Phase 3] Local Relational Persistence (SQLite)
**Objective:** Establish secure, zero-configuration local data storage using SQLite embedded in the Rust backend.
* Integrated `rusqlite` into Tauri's rust compilation.
* Implemented automatic database bootstrapping on application launch to establish the `assets` and `cashflow` tables.
* Exposed Tauri commands for CRUD operations on ledger holdings and cashflow transactions.
* Created a multi-tab frontend interface in React to manage holdings and transactions natively.

## [Phase 4] Async Market Feeds & Price Caching
**Objective:** Integrate asynchronous Web API fetching in Rust with disk-backed cache fallback for offline reliability.
* Configured `reqwest` with `rustls-tls` for secure HTTPS REST queries.
* Implemented live feed fetchers for Mutual Fund NAVs (MFapi.in) and Stock Prices (Yahoo Finance v8 chart API).
* Coded a local file cache (`price_cache.json`) in the user's local App Data directory to cache resolved prices, serving as a reliable fallback when offline.
* Introduced a Monthly Budget BarChart and Category Spend Analyser on the frontend to visualize income vs. expenses.

## [Phase 5] Local Authentication, Visual Makeover & Onboarding Restructuring
**Objective:** Secure the app with local user credentials, customize UI colors, restructure onboarding, and implement advanced AI insights.
* **Cryptographic Session Security:** 
    * Integrated `sha2` crate in the Rust backend for secure local SHA-256 password hashing.
    * Added user registration and login commands inside `db.rs` and registered them in `lib.rs`.
    * Upgraded relational schema to include a `username` column in both `assets` and `cashflow` tables, isolating ledger holdings and cashflow records per-user to support multiple usage.
    * Automatically detect old schema on launch, dropping tables cleanly to execute the isolated database upgrade.
    * Added session locking (lock/logout) capability to block access and require credentials on boot or logout.
* **UI Themes & Aesthetics:**
    * Implemented a solid black backdrop with Rose-Gold (`#b76e79`) accents, Chrome-Silver borders, and prominent Yellowish-Green (Lime) action styles for buttons and tabs.
    * Styled AreaChart (Nominal vs. Real) using Royal Blue for nominal targets and Neon Green for real purchasing power.
    * Configured Cashflow BarChart using Neon Green (Income), Dull Red (Expense), and Royal Blue (Investment).
* **Structured Onboarding Journey:**
    * Restyled onboarding into 4 sequential screens: Cashflow inputs, Money sinks/savings (with interactive 15% trim scenario), FIRE target choosing (Lean, Normal, Cozy, Fat card grids with manual increase inputs), and Avenues for higher savings (mutual funds and stocks).
* **Advanced AI Features:**
    * Designated Gemini AI integration as an advanced optional feature requiring the user to provide their own API key.
    * Added a dedicated Advanced AI strategy section in the Analytics tab allowing users to query personalized advisor strategies on demand.

