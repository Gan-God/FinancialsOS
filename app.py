import streamlit as st
import pandas as pd
from market_feed import MarketEngine
from calculus_engine import FIREEngine
import portfolio_db

# ---------------------------------------------------------
# INITIALIZATION & CACHING
# ---------------------------------------------------------
st.set_page_config(page_title="Infinite Horizon Engine", layout="wide")

# Initialize the SQLite database on startup
portfolio_db.init_db()

@st.cache_resource
def get_market_engine():
    return MarketEngine()

market_engine = get_market_engine()

# Fetch portfolio dynamically from SQLite
portfolio_data = portfolio_db.get_all_assets()

# ---------------------------------------------------------
# SIDEBAR: SYSTEM PARAMETERS
# ---------------------------------------------------------
st.sidebar.header("🎯 Target & Lifecycle Rules")
lifestyle_cost_today = st.sidebar.number_input("Desired Monthly Lifestyle Cost Today (₹)", value=100000, step=5000)
timeline_years = st.sidebar.slider("Investment Horizon (Years)", 5, 40, 20, 1)
swr = st.sidebar.slider("Safe Withdrawal Rate (SWR %)", 2.0, 6.0, 3.5, 0.1)

st.sidebar.markdown("---")
st.sidebar.header("📈 Market & Economic Assumptions")
nominal_cagr = st.sidebar.slider("Expected Portfolio Nominal CAGR (%)", 5.0, 25.0, 13.0, 0.5)
inflation_rate = st.sidebar.slider("Real Inflation / Currency Decay (%)", 0.0, 15.0, 9.0, 0.5)
step_up_rate = st.sidebar.slider("Annual SIP Step-Up Rate (%)", 0.0, 25.0, 10.0, 1.0)

# ---------------------------------------------------------
# SIDEBAR: PORTFOLIO MANAGER (SQLITE UI)
# ---------------------------------------------------------
st.sidebar.markdown("---")
st.sidebar.header("⚙️ Portfolio Manager")

with st.sidebar.expander("➕ Add / Update Asset", expanded=False):
    with st.form("add_asset_form", clear_on_submit=True):
        asset_type = st.selectbox("Asset Type", ["MF", "Stock"])
        asset_code = st.text_input("Ticker / AMFI Code", help="e.g., '120503' or 'RELIANCE.NS'")
        asset_units = st.number_input("Units Held", min_value=0.0, format="%.4f")
        
        if st.form_submit_button("Save Asset"):
            if asset_code:
                portfolio_db.add_or_update_asset(asset_type, asset_code.strip(), asset_units)
                st.success(f"Added {asset_code}!")
                st.rerun()  # Instantly refresh the app to load new data

with st.sidebar.expander("🗑️ Remove Asset", expanded=False):
    if portfolio_data:
        asset_to_remove = st.selectbox("Select Asset to Delete", [a['code'] for a in portfolio_data])
        if st.button("Delete"):
            portfolio_db.remove_asset(asset_to_remove)
            st.warning(f"Deleted {asset_to_remove}")
            st.rerun()
    else:
        st.info("Portfolio is empty.")

# ---------------------------------------------------------
# LIVE DATA RESOLUTION
# ---------------------------------------------------------
total_current_value = 0.0
resolved_assets = []

for asset in portfolio_data:
    if asset["type"] == "MF":
        data = market_engine.get_mf_nav(asset["code"])
    else:
        data = market_engine.get_stock_price(asset["code"])
        
    market_value = data["price"] * asset["units"]
    total_current_value += market_value
    
    resolved_assets.append({
        "Asset Name": data["name"],
        "Type": asset["type"],
        "Code": asset["code"],
        "Units": asset["units"],
        "Live Price": round(data["price"], 2),
        "Current Value (₹)": round(market_value, 2),
        "Feed Status": data["status"]
    })

df_assets = pd.DataFrame(resolved_assets)

# ---------------------------------------------------------
# CALCULUS ENGINE EXECUTION
# ---------------------------------------------------------
fire_engine = FIREEngine(
    current_portfolio_value=total_current_value,
    lifestyle_cost_today=lifestyle_cost_today,
    inflation_rate=inflation_rate / 100.0,
    nominal_cagr=nominal_cagr / 100.0,
    step_up_rate=step_up_rate / 100.0,
    timeline_years=timeline_years,
    swr=swr / 100.0
)

optimal_base_sip = fire_engine.optimize_starting_sip()
df_simulation = fire_engine.run_simulation(optimal_base_sip)
df_chart = df_simulation.set_index("Month")

# ---------------------------------------------------------
# MAIN DASHBOARD UI
# ---------------------------------------------------------
st.title("🛡️ The Infinite Horizon Freedom Engine")
st.markdown("---")

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("Live Net Worth Tracked", f"₹{total_current_value:,.2f}")
with col2:
    st.metric("Target (Today's Power)", f"₹{fire_engine.true_fire_today:,.2f}")
with col3:
    st.metric("Nominal Future Target", f"₹{fire_engine.nominal_target:,.2f}")
with col4:
    st.metric("Required Start SIP Today", f"₹{optimal_base_sip:,.2f}", 
              help="The exact amount you must invest this month. This assumes you will increase it annually by your chosen Step-Up rate.")

st.subheader("📉 Wealth Trajectory: Nominal Illusion vs. True Purchasing Power")
st.area_chart(df_chart[["Nominal_Value", "Real_Value"]])

tab1, tab2 = st.tabs(["📊 Live Assets Tracking Ledger", "🧮 Pure Numerical Stream"])

with tab1:
    if not df_assets.empty:
        st.dataframe(df_assets, width='stretch')
    else:
        st.info("Your portfolio is currently empty. Add assets using the Portfolio Manager in the sidebar.")

with tab2:
    st.dataframe(df_simulation.style.format({
        "Nominal_Value": "₹{:,.2f}", 
        "Real_Value": "₹{:,.2f}"
    }), width='stretch')
