from calculus_engine import FIREEngine

# Assume we already have ₹5 Lakhs invested, need ₹1 Lakh/month, 9% inflation, 13% CAGR, 10% step-up over 20 years
engine = FIREEngine(
    current_portfolio_value=500000, 
    lifestyle_cost_today=100000, 
    inflation_rate=0.09, 
    nominal_cagr=0.13, 
    step_up_rate=0.10, 
    timeline_years=20
)

print(f"True FIRE Target (Today's Power): ₹{engine.true_fire_today:,.2f}")
print(f"Nominal Target (Illusion): ₹{engine.nominal_target:,.2f}")

optimal_sip = engine.optimize_starting_sip()
print(f"\n=> REQUIRED SIP TODAY: ₹{optimal_sip:,.2f} / month")

# Run the simulation with the optimal SIP to verify
df = engine.run_simulation(optimal_sip)
print(f"\nFinal Real Wealth Achieved: ₹{df['Real_Value'].iloc[-1]:,.2f}")
