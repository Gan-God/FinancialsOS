# **FinancialsOS: User Journey and App Flow**

## **1\. UX Design Philosophy**

* **Local-First Trust:** The application must feel incredibly fast and explicit about data locality. The user must understand immediately that their net worth is not being synced to a third-party server.  
* **Progressive Disclosure:** Prevent cognitive overload. Core metrics (Net Worth, Target SIP) are front and center. Complex configuration (Tax, Active Trading) is contained within specific, isolated tabs.  
* **Keyboard Navigation:** Prioritize efficiency with keyboard shortcuts (e.g., \`/\` for search, \`Cmd/Ctrl \+ N\` for new entry) to cater to power users.

## **2\. Customer Journey Phases**

### **Phase 1: The "First Run" Onboarding (Time to Value: \< 3 Minutes)**

* **Objective:** Deliver an immediate "Aha\!" moment with minimal data entry.  
* **Step 1: The Baseline:** The application asks one core question: *"What does your ideal lifestyle cost today?"*  
* **Step 2: The Foundation:** The application requests the user's current total liquid savings/investments.  
* **Step 3: The Engine Runs:** The Infinite Horizon calculus engine generates a visual graph demonstrating the gap between their Nominal Future Value (the illusion) and True Purchasing Power.  
* **Step 4: The Hook:** The app outputs the exact Rupee amount the user needs to start investing *today* (the SIP Target) and prompts the setup of detailed tracking.

### **Phase 2: Daily Interaction (The Habit Loop)**

* **Objective:** Seamless integration into daily routine for quick health checks.  
* **The Dashboard:** Displays top-line metrics: Total Liquid Net Worth, Current Month Cash Flow, and Market Daily Change.  
* **Quick-Add Modal:** A globally accessible, low-friction entry point for logging manual expenses or active trades.  
* **Market Pulse Ticker:** A discreet visual feed of the user's specifically tracked assets updating asynchronously.

### **Phase 3: The Monthly Review (Strategic Adjustments)**

* **Objective:** Provide deep, analytical insights without requiring manual spreadsheet manipulation.  
* **Cashflow Analysis:** A Sankey diagram visually maps the month's capital flow (Income \-\> Taxes \-\> Expenses \-\> Savings).  
* **Step-Up Verification:** The engine flags whether the user is maintaining their defined annual step-up investment rate.  
* **Tax Optimization Prompts:** Proactive alerts regarding remaining deduction limits (e.g., Section 80C) before the fiscal year-end.

### **Phase 4: Advanced Mastery (Active Exploration)**

* **Objective:** Facilitate deep strategic planning and stress testing.  
* **Active Portfolio Command:** Detailed breakdown of active stock trades, dividend yields, and XIRR performance against passive benchmarks.  
* **Macro-Economic Stress Testing:** An interactive slider panel allowing users to model worst-case scenarios (e.g., prolonged high inflation or severe market downturns) to instantly recalculate their survival timeline.