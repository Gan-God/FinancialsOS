# **FinancialsOS: Architecture and Requirements**

## **1\. Core Identity & Value Proposition**

FinancialsOS is a highly optimized, local-first financial operating system. It moves away from arbitrary linear CAGR calculations to provide continuous calculus-based financial modeling, absolute data privacy via a local SQLite database, and actionable metrics for distinct lifestyle targets (Lean, Normal, Cozy, Fat FIRE).

## **2\. Technical Architecture Stack**

| Layer | Technology | Purpose |
| :---- | :---- | :---- |
| **Frontend UI** | React.js (TypeScript) | Component-based, highly responsive interface providing interactive charting and state management. |
| **Application Framework** | Tauri | Binds the web UI to the OS native webview, drastically reducing RAM and bundle size compared to Electron, while compiling into a secure, standalone binary. |
| **Backend & Core Engine** | Rust | Handles intensive calculus computations (e.g., non-linear differential equations for wealth projections) and secure filesystem operations with C-level execution speed. |
| **Data Persistence** | SQLite | Local-first, zero-configuration relational database embedded directly by the Rust backend to securely manage portfolio data and configuration settings. |
| **Live Data Feeds** | Custom Asynchronous Fetchers | Fault-tolerant API integrations (e.g., Yahoo Finance, MFapi.in) with automatic local caching to ensure functionality during network outages. |

## **3\. Key System Dependencies (Fedora Native Build)**

* **Rust Toolchain:** \`rustc\` and \`cargo\` for compiling the backend.  
* **Node Package Manager:** \`npm\` for managing React frontend dependencies.  
* **Tauri Prerequisites:** \`webkit2gtk4.1-devel\`, \`curl\`, \`wget\`, \`openssl-devel\`, \`appmenu-gtk3-module\`, \`libappindicator-gtk3\`, \`librsvg2-devel\`.

## **4\. Module Specifications**

### **4.1 The Infinite Horizon Engine**

The core continuous calculus engine that strips away the "nominal illusion." It accounts for compound inflation, currency decay, and user-defined annual step-up allocations to calculate the exact initial SIP required to hit a specific real-purchasing-power target.

### **4.2 Zero-Based Cashflow Command**

Granular budgeting interface to track incoming cash against fixed expenses and variable burn rates. Emphasizes visualization through Sankey diagrams for monthly flow analysis.

### **4.3 Active Portfolio Command**

Tracks live P\&L, capital allocation heatmaps, and true XIRR across active stock trades and passive mutual fund SIPs, entirely independent of bloated web dashboards.

### **4.4 Tax Optimization**

Localized projections for maximizing deductions and shielding wealth, currently optimized for Indian tax regimes (e.g., 80C, 80D).