# FinancialsOS (v0.1.3)

**FinancialsOS** is a secure, local-first financial operating system designed to track cashflows, calculate real-time asset ledger valuations (P&L/NAV), and simulate wealth horizon projections under severe macroeconomic stress.

Built with **Tauri v2**, **Rust**, **SQLite**, and **React (TypeScript)**, FinancialsOS stores 100% of your financial information locally on your device, with zero external database dependencies.

---

## 🚀 Key Features

* **Relational Relational Vaults:** Multi-user registry supporting separate vault creations on the same machine. Vaults are secured with SHA256 key hashing and a **5-minute session inactivity auto-lock**.
* **Double-Entry Cashflow & Asset Ledger:** Log equity stocks (Yahoo Finance symbols) and Indian mutual funds (MFapi.in scheme codes). Features average cost basis tracking, live price updates, and net absolute/percentage P&L tracking.
* **CAMS PDF Statement Decryptor:** Drag and drop CAMS/NSDL Consolidated Account Statement (e-CAS) PDFs. Auto-decrypts statements locally using your stored PAN details.
* **SVG Sankey Capital Flows:** Visual flow channels mapping capital inflow splits across fixed expenses, discretionary spending, and active investments.
* **Horizon Calculus Engine:** Simulates monthly SIP targets required to reach cozy, normal, or lean FIRE targets. Graphs nominal projections against true real purchasing power.
* **Economic Stress Testing Sliders:** Collapsible panel to test portfolio resilience under severe events (+15% inflation spikes and -50% immediate market corrections).
* **Glassmorphic Theme Customizer:** Toggle dynamically between premium **Metallic Dark Mode** (yellowish-green and rose-gold accents) and **Champagne Light Mode** (alabaster base and warm silver borders).
* **Keyboard Navigation:** Shortcut hotkeys (`Alt + 1/2/3/4` for tab navigation, `/` for field focus) mapped to a header shortcuts helper guide.
* **Web Demo Fallback:** An integrated fallback adapter mapping Tauri database commands to browser `localStorage` when running outside the Tauri environment.

---

## 🛠️ Technology Stack

* **Desktop Application Engine:** [Tauri v2](https://tauri.app/) (Rust wrapper)
* **Relational Database:** SQLite (via `rusqlite` driver)
* **Frontend Library:** [React 19](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/)
* **CSS Framework:** PostCSS & [Tailwind CSS v4](https://tailwindcss.com/)
* **Data Visualization:** [Recharts](https://recharts.org/) & Raw custom SVG drawing components

---

## 💻 Local Setup & Development

### 1. Prerequisites
Ensure you have the Tauri prerequisites installed on your system. Refer to the [Tauri Setup Guide](https://tauri.app/start/prerequisites/) for your operating system.
* Node.js (v18+)
* Rust (rustc & cargo)

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Run Development Environment
Launch the hot-reloading Vite server and Tauri desktop window:
```bash
npm run tauri dev
```

### 4. Build Production Binaries
Compile the optimized frontend code and bundle it into a standalone desktop executable (native `.deb`, `.dmg`, or `.exe` based on your platform):
```bash
npm run build
npm run tauri build
```
*(The compiled binaries will be saved in `src-tauri/target/release/bundle/`)*
