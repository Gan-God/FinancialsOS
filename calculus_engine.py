import numpy as np
import pandas as pd

class FIREEngine:
    def __init__(self, current_portfolio_value: float, lifestyle_cost_today: float, 
                 inflation_rate: float, nominal_cagr: float, step_up_rate: float, 
                 timeline_years: int, swr: float = 0.035):
        """
        Initializes the dynamic continuous math engine.
        Rates should be passed as decimals (e.g., 0.09 for 9%).
        """
        self.current_value = current_portfolio_value
        self.lifestyle_cost = lifestyle_cost_today
        self.inflation = inflation_rate
        self.cagr = nominal_cagr
        self.step_up = step_up_rate
        self.years = timeline_years
        self.swr = swr
        
        # Core Target Calculations
        self.true_fire_today = (self.lifestyle_cost * 12) / self.swr
        self.nominal_target = self.true_fire_today * ((1 + self.inflation) ** self.years)
        
        # Matrix Setup
        self.total_months = self.years * 12
        self.months_array = np.arange(1, self.total_months + 1)

    def run_simulation(self, initial_sip: float) -> pd.DataFrame:
        """
        Executes the row-by-row differential approximation.
        Compounds wealth at nominal rates while simultaneously deflating it via inflation.
        """
        nominal_portfolio = []
        real_portfolio = []
        current_nominal = self.current_value
        
        for m in self.months_array:
            current_year = int((m - 1) / 12) + 1
            
            # Step function: Escalate SIP annually
            current_sip = initial_sip * ((1 + self.step_up) ** (current_year - 1))
            
            # Compound nominal growth path
            current_nominal = (current_nominal + current_sip) * (1 + (self.cagr / 12))
            nominal_portfolio.append(current_nominal)
            
            # Strip away continuous currency degradation to find true purchasing power
            current_real = current_nominal / ((1 + (self.inflation / 12)) ** m)
            real_portfolio.append(current_real)
            
        return pd.DataFrame({
            "Month": self.months_array,
            "Nominal_Value": nominal_portfolio,
            "Real_Value": real_portfolio
        })

    def optimize_starting_sip(self) -> float:
        """
        Uses a binary search loop to solve the non-linear equation.
        Finds the exact initial SIP required today to hit the Real Value target.
        """
        low, high = 0.0, 1000000.0  # Search space boundary (0 to 10 Lakhs/month)
        optimal_sip = 0.0
        
        for _ in range(60):  # 60 iterations guarantees sub-paise precision
            mid = (low + high) / 2
            df = self.run_simulation(mid)
            final_real_wealth = df["Real_Value"].iloc[-1]
            
            if final_real_wealth >= self.true_fire_today:
                optimal_sip = mid
                high = mid  # Try to find an even tighter, lower valid amount
            else:
                low = mid   # Target missed, need to invest more
                
        return round(optimal_sip, 2)
