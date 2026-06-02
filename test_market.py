from market_feed import MarketEngine

engine = MarketEngine()

print("Fetching Axis Bluechip Fund...")
mf = engine.get_mf_nav("120503")
print(mf)

print("\nFetching NIFTY 50 ETF...")
etf = engine.get_stock_price("NIFTYBEES.NS")
print(etf)
