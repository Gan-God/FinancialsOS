import streamlit as st
import pandas as pd
from market_feed import MarketEngine
from calculus_engine import FIREEngine

# Set up the dashboard layout
st.set_page_config(page_title="Infinite Horizon Engine", layout="wide")

# ---------------------------------------------------------
# CACHED DATA INITIALIZATION
# ---------------------------------------------------------
@st.cache_resource
def get_market_engine():
    """Instantiate the market engine once per session to utilize its internal JSON cache."""
    return MarketEngine()

market_engine = get_market_engine()

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
# ASSET STORE (Edit this list to match your actual holdings)
# ---------------------------------------------------------
portfolio_data = [
    {"type": "MF", "code": "120503", "units": 4500.50},    # Axis ELSS
    {"type": "Stock", "code": "NIFTYBEES.NS", "units": 1200} # Nippon Nifty 50
]

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
        "Units": asset["units"],
        "Live Price": round(data["price"], 2),
        "Current Value (₹)": round(market_value, 2),
        "Feed Status": data["status"]
    })

df_assets = pd.DataFrame(resolved_assets)

# ---------------------------------------------------------
# CALCULUS ENGINE EXECUTION
# ---------------------------------------------------------
# Initialize the mathematical backend with sidebar variables
fire_engine = FIREEngine(
    current_portfolio_value=total_current_value,
    lifestyle_cost_today=lifestyle_cost_today,
    inflation_rate=inflation_rate / 100.0,
    nominal_cagr=nominal_cagr / 100.0,
    step_up_rate=step_up_rate / 100.0,
    timeline_years=timeline_years,
    swr=swr / 100.0
)

# Run the optimization loop
optimal_base_sip = fire_engine.optimize_starting_sip()

# Generate the trajectory dataframe based on the optimal SIP
df_simulation = fire_engine.run_simulation(optimal_base_sip)
# Streamlit charts prefer the x-axis to be the index
df_chart = df_simulation.set_index("Month")

# ---------------------------------------------------------
# MAIN DASHBOARD UI
# ---------------------------------------------------------
st.title("🛡️ The Infinite Horizon Freedom Engine")
st.markdown("---")

# Row 1: The Metrics Matrix
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

# Row 2: Visualizing the Matrix
st.subheader("📉 Wealth Trajectory: Nominal Illusion vs. True Purchasing Power")
st.area_chart(df_chart[["Nominal_Value", "Real_Value"]])

# Row 3: Granular Data Tabs
tab1, tab2 = st.tabs(["📊 Live Assets Tracking Ledger", "🧮 Pure Numerical Stream"])

with tab1:
    st.dataframe(df_assets, use_container_width=True)

with tab2:
    st.dataframe(df_simulation.style.format({
        "Nominal_Value": "₹{:,.2f}", 
        "Real_Value": "₹{:,.2f}"
    }), use_container_width=True)
