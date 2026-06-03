# FinancialsOS: Development Logbook

## [Phase 1] Architecture Pivot & Security Lockdown
**Objective:** Transition from a loosely coupled script prototype to a secure, compiled desktop executable.

* **The Python Prototype:** Initially built the continuous calculus FIRE simulation using Python (Streamlit + Pandas). While mathematically accurate, running a local Python server is not viable for a frictionless end-user desktop product.
* **Security & Licensing:** Moved away from the MIT license to a strict Proprietary ("All Rights Reserved") license to protect the core intellectual property. Transitioned local Git authentication from HTTPS to cryptographic SSH (Ed25519) for secure repository management.
* **The Tauri Pivot:** Adopted the Tauri framework (Rust backend + React/TypeScript frontend). 
    * *Why Tauri over Electron?* By binding to the native OS webview (WebKitGTK on Fedora/Linux), the application will consume a fraction of the RAM while maintaining C-level execution speeds via the Rust backend. 

## [Phase 2] The Rust Calculus Engine (Current)
**Objective:** Port the non-linear differential math and binary search optimization loop from Python into a high-performance Rust macro.
