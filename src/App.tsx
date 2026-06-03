import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AreaChart, Area, BarChart, Bar, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Target, Shield, Wallet, Plus, Trash2, ArrowUpRight, ArrowDownRight, BarChart3, RefreshCw, Lock, Key, UserPlus, User, CheckCircle, ChevronRight, Brain, LogOut, Upload, Check, AlertTriangle } from "lucide-react";
import "./App.css";

interface SimulationResult {
  optimal_sip: number;
  true_fire_today: number;
  nominal_target: number;
  nominal_trajectory: number[];
  real_trajectory: number[];
}

interface ResolvedAsset {
  type: string;
  code: string;
  name: string;
  units: number;
  price: number;
  value: number;
  date: string;
  status: string;
  avg_buy_price: number;
  pnl: number;
  pnl_percentage: number;
}

interface CashflowItem {
  id: number;
  category: string;
  description?: string;
  amount: number;
  flow_type: string;
  date: string;
}

// Helpers defined at module scope to avoid React closure/re-render issues
const getYear = (dateStr: string) => dateStr.substring(0, 4);

const getMonthYear = (dateStr: string) => {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = parseInt(dateStr.substring(5, 7), 10);
  const y = dateStr.substring(0, 4);
  if (m >= 1 && m <= 12) {
    return `${monthNames[m - 1]} ${y}`;
  }
  return `Unknown ${y}`;
};

// Web Demo invoke adapter
async function appInvoke(cmd: string, args?: any): Promise<any> {
  const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
  if (!isTauri) {
    return mockInvoke(cmd, args);
  }
  return invoke(cmd, args);
}

// Helper to hash password mock
async function sha256Mock(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function mockInvoke(cmd: string, args?: any): Promise<any> {
  console.log(`[Web Demo] Mock invoke: ${cmd}`, args);
  await new Promise(resolve => setTimeout(resolve, 150)); // artificial network latency

  switch (cmd) {
    case "has_user": {
      const users = JSON.parse(localStorage.getItem("fo_users") || "[]");
      return users.length > 0;
    }
    case "register_user": {
      const users = JSON.parse(localStorage.getItem("fo_users") || "[]");
      const { username, passwordRaw } = args;
      const passHash = await sha256Mock(passwordRaw);
      users.push({ username: username.toLowerCase(), passHash });
      localStorage.setItem("fo_users", JSON.stringify(users));
      return null;
    }
    case "login_user": {
      const users = JSON.parse(localStorage.getItem("fo_users") || "[]");
      const { username, passwordRaw } = args;
      const passHash = await sha256Mock(passwordRaw);
      const found = users.find((u: any) => u.username === username.toLowerCase() && u.passHash === passHash);
      return !!found;
    }
    case "get_settings": {
      const { username } = args;
      const allSettings = JSON.parse(localStorage.getItem("fo_settings") || "{}");
      return allSettings[username.toLowerCase()] || null;
    }
    case "save_settings": {
      const { username, geminiApiKey, inflationRate, nominalCagr, stepUpRate, swr, panNumber, panName } = args;
      const allSettings = JSON.parse(localStorage.getItem("fo_settings") || "{}");
      allSettings[username.toLowerCase()] = {
        username: username.toLowerCase(),
        gemini_api_key: geminiApiKey,
        inflation_rate: inflationRate,
        nominal_cagr: nominalCagr,
        step_up_rate: stepUpRate,
        swr: swr,
        pan_number: panNumber,
        pan_name: panName
      };
      localStorage.setItem("fo_settings", JSON.stringify(allSettings));
      return null;
    }
    case "get_cashflow": {
      const { username } = args;
      const allCashflows = JSON.parse(localStorage.getItem("fo_cashflows") || "[]");
      return allCashflows.filter((cf: any) => cf.username === username.toLowerCase());
    }
    case "add_cashflow": {
      const { username, category, description, amount, flowType, date } = args;
      const allCashflows = JSON.parse(localStorage.getItem("fo_cashflows") || "[]");
      const newItem = {
        id: Date.now(),
        username: username.toLowerCase(),
        category,
        description,
        amount,
        flow_type: flowType,
        date
      };
      allCashflows.push(newItem);
      localStorage.setItem("fo_cashflows", JSON.stringify(allCashflows));
      return null;
    }
    case "remove_cashflow": {
      const { username, id } = args;
      let allCashflows = JSON.parse(localStorage.getItem("fo_cashflows") || "[]");
      allCashflows = allCashflows.filter((cf: any) => !(cf.username === username.toLowerCase() && cf.id === id));
      localStorage.setItem("fo_cashflows", JSON.stringify(allCashflows));
      return null;
    }
    case "get_transactions": {
      const { username, code } = args;
      const allTx = JSON.parse(localStorage.getItem("fo_transactions") || "[]");
      return allTx.filter((t: any) => t.username === username.toLowerCase() && t.code === code.toUpperCase());
    }
    case "add_transaction": {
      const { username, assetType, code, buyPrice, units, purchaseDate } = args;
      const allTx = JSON.parse(localStorage.getItem("fo_transactions") || "[]");
      const newItem = {
        id: Date.now(),
        username: username.toLowerCase(),
        asset_type: assetType,
        code: code.toUpperCase(),
        buy_price: buyPrice,
        units: units,
        purchase_date: purchaseDate
      };
      allTx.push(newItem);
      localStorage.setItem("fo_transactions", JSON.stringify(allTx));
      return null;
    }
    case "remove_transaction": {
      const { username, id } = args;
      let allTx = JSON.parse(localStorage.getItem("fo_transactions") || "[]");
      allTx = allTx.filter((t: any) => !(t.username === username.toLowerCase() && t.id === id));
      localStorage.setItem("fo_transactions", JSON.stringify(allTx));
      return null;
    }
    case "get_assets": {
      const { username } = args;
      const allTx = JSON.parse(localStorage.getItem("fo_transactions") || "[]");
      const userTx = allTx.filter((t: any) => t.username === username.toLowerCase());
      
      const groups: Record<string, { type: string, code: string, units: number, cost: number }> = {};
      userTx.forEach((tx: any) => {
        if (!groups[tx.code]) {
          groups[tx.code] = { type: tx.asset_type, code: tx.code, units: 0, cost: 0 };
        }
        groups[tx.code].units += tx.units;
        groups[tx.code].cost += tx.units * tx.buy_price;
      });

      return Object.values(groups).map((g: any) => ({
        type: g.type,
        code: g.code,
        units: g.units,
        avg_buy_price: g.units > 0 ? g.cost / g.units : 0
      }));
    }
    case "get_resolved_portfolio": {
      const { username } = args;
      return mockGetResolvedPortfolio(username);
    }
    case "calculate_fire": {
      return mockCalculateFire(args);
    }
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

async function mockGetResolvedPortfolio(username: string): Promise<any[]> {
  const assets = await mockInvoke("get_assets", { username });
  const cache = JSON.parse(localStorage.getItem("fo_price_cache") || "{}");
  const resolved = [];
  const nowStr = new Date().toLocaleDateString("en-GB"); // dd-mm-yyyy

  for (const asset of assets) {
    let price = 100.0;
    let name = asset.code;
    let date = nowStr;
    let status = "MOCK";

    const cacheKey = `${asset.type}_${asset.code}`;
    if (asset.type === "MF") {
      try {
        const res = await fetch(`https://api.mfapi.in/mf/${asset.code}/latest`);
        if (res.ok) {
          const data = await res.json();
          if (data.data && data.data.length > 0) {
            price = parseFloat(data.data[0].nav);
            name = data.meta.scheme_name;
            date = data.data[0].date;
            status = "LIVE";
          }
        }
      } catch (e) {
        console.warn("CORS/network error fetching MF, using cache/mock", e);
      }
    } else {
      const mockStockPrices: Record<string, { price: number; name: string }> = {
        "AAPL": { price: 175.50, name: "Apple Inc." },
        "MSFT": { price: 420.20, name: "Microsoft Corporation" },
        "GOOGL": { price: 150.30, name: "Alphabet Inc." },
        "TSLA": { price: 180.10, name: "Tesla Inc." },
        "RELIANCE.NS": { price: 2950.00, name: "Reliance Industries Ltd." },
        "TCS.NS": { price: 3900.00, name: "Tata Consultancy Services Ltd." },
        "INFY.NS": { price: 1600.00, name: "Infosys Ltd." },
        "NIFTYBEES.NS": { price: 250.50, name: "Nippon India ETF Nifty Bees" },
      };
      const codeUpper = asset.code.toUpperCase();
      if (mockStockPrices[codeUpper]) {
        price = mockStockPrices[codeUpper].price;
        name = mockStockPrices[codeUpper].name;
        status = "LIVE (MOCK)";
      } else {
        if (cache[cacheKey]) {
          price = cache[cacheKey].price;
          name = cache[cacheKey].name;
          date = cache[cacheKey].date;
          status = "CACHED (OFFLINE)";
        } else {
          price = 100.0 + Math.random() * 50;
          name = `${asset.code} Stock`;
          status = "MOCK_RANDOM";
        }
      }
    }

    cache[cacheKey] = { price, name, date };

    const value = price * asset.units;
    const totalCost = asset.avg_buy_price * asset.units;
    const pnl = value - totalCost;
    const pnlPercentage = totalCost > 0.0 ? (pnl / totalCost) * 100.0 : 0.0;

    resolved.push({
      type: asset.type,
      code: asset.code,
      name,
      units: asset.units,
      price,
      value,
      date,
      status,
      avg_buy_price: asset.avg_buy_price,
      pnl,
      pnl_percentage: pnlPercentage
    });
  }

  localStorage.setItem("fo_price_cache", JSON.stringify(cache));
  return resolved;
}

function mockCalculateFire(args: any) {
  const cp = Math.max(0, parseFloat(args.currentPortfolio) || 0);
  const lc = Math.max(0, parseFloat(args.lifestyleCost) || 0);
  const ir = Math.max(0, parseFloat(args.inflationRate) || 0);
  const cagr = Math.max(0, parseFloat(args.nominalCagr) || 0);
  const sur = Math.max(0, parseFloat(args.stepUpRate) || 0);
  const y = Math.max(0, parseFloat(args.years) || 0);
  const s = Math.max(0.0001, parseFloat(args.swr) || 0.035);

  if (lc <= 0 || y <= 0 || s <= 0) {
    throw new Error("Invalid parameters for FIRE calculation");
  }

  const true_fire_today = (lc * 12.0) / s;
  const nominal_target = true_fire_today * Math.pow(1.0 + ir, y);
  const total_months = Math.floor(y * 12.0);

  const run_simulation = (initial_sip: number) => {
    const nominal_trajectory = [];
    const real_trajectory = [];
    let current_nominal = cp;

    for (let m = 1; m <= total_months; m++) {
      const current_year = Math.floor((m - 1) / 12) + 1;
      const current_sip = initial_sip * Math.pow(1.0 + sur, current_year - 1);

      current_nominal = (current_nominal + current_sip) * (1.0 + (cagr / 12.0));
      nominal_trajectory.push(current_nominal);

      const current_real = current_nominal / Math.pow(1.0 + (ir / 12.0), m);
      real_trajectory.push(current_real);
    }

    return { nominal_trajectory, real_trajectory };
  };

  let low = 0.0;
  let high = Math.max(true_fire_today, 10000000.0);
  let optimal_sip = 0.0;

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2.0;
    const { real_trajectory } = run_simulation(mid);
    const final_real_wealth = real_trajectory[real_trajectory.length - 1] || 0.0;

    if (final_real_wealth >= true_fire_today) {
      optimal_sip = mid;
      high = mid;
    } else {
      low = mid;
    }
  }

  const { nominal_trajectory, real_trajectory } = run_simulation(optimal_sip);

  return {
    optimal_sip: Math.round(optimal_sip * 100.0) / 100.0,
    true_fire_today,
    nominal_target,
    nominal_trajectory,
    real_trajectory,
  };
}

function App() {
  // Authentication & Session State
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [loggedInUser, setLoggedInUser] = useState<string>("");
  const [hasLocalUser, setHasLocalUser] = useState<boolean>(false);
  const [authUsername, setAuthUsername] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  // Navigation State
  const [activeTab, setActiveTab] = useState<"horizon" | "assets" | "cashflow" | "analytics">("horizon");

  // Onboarding Flow State
  const [isOnboarding, setIsOnboarding] = useState<boolean>(false);
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [obIncome, setObIncome] = useState<number>(150000);
  const [obFixed, setObFixed] = useState<number>(60000);
  const [obVariable, setObVariable] = useState<number>(20000);
  const [obFireType, setObFireType] = useState<"lean" | "normal" | "cozy" | "fat">("normal");
  const [obCustomFireTarget, setObCustomFireTarget] = useState<number>(0);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [panNumber, setPanNumber] = useState<string>("");
  const [panName, setPanName] = useState<string>("");

  // Advanced AI Dashboard State
  const [dashGeminiApiKey, setDashGeminiApiKey] = useState<string>("");
  const [dashAiAnalysis, setDashAiAnalysis] = useState<string>("");
  const [dashAiLoading, setDashAiLoading] = useState<boolean>(false);

  // Horizon State
  const [currentPortfolio, setCurrentPortfolio] = useState<number>(500000);
  const [lifestyleCost, setLifestyleCost] = useState<number>(100000);
  const [inflationRate, setInflationRate] = useState<number>(0.09);
  const [nominalCagr, setNominalCagr] = useState<number>(0.13);
  const [stepUpRate, setStepUpRate] = useState<number>(0.10);
  const [years, setYears] = useState<number>(20);
  const [swr, setSwr] = useState<number>(0.035);

  // Result State
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // SQLite Ledger & Feeds States
  const [resolvedAssets, setResolvedAssets] = useState<ResolvedAsset[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [cashflows, setCashflows] = useState<CashflowItem[]>([]);

  // Asset Form State
  const [newAssetType, setNewAssetType] = useState<string>("MF");
  const [newAssetCode, setNewAssetCode] = useState<string>("");
  const [newAssetUnits, setNewAssetUnits] = useState<number>(0);
  const [newAssetBuyPrice, setNewAssetBuyPrice] = useState<number>(0);
  const [newAssetPurchaseDate, setNewAssetPurchaseDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Transaction History Collapsible State
  const [expandedAssetCode, setExpandedAssetCode] = useState<string | null>(null);
  const [expandedAssetTxs, setExpandedAssetTxs] = useState<any[]>([]);
  const [loadingTxs, setLoadingTxs] = useState<boolean>(false);

  // Economic Stress Testing States
  const [stressInflationSpike, setStressInflationSpike] = useState<number>(0);
  const [stressMarketCrash, setStressMarketCrash] = useState<number>(0);
  const [showStressPanel, setShowStressPanel] = useState<boolean>(false);

  // CAS Import States
  const [ledgerInputMethod, setLedgerInputMethod] = useState<"manual" | "cas">("manual");
  const [casFile, setCasFile] = useState<File | null>(null);
  const [casPassword, setCasPassword] = useState<string>("");
  const [isCasDecrypting, setIsCasDecrypting] = useState<boolean>(false);
  const [casParsedData, setCasParsedData] = useState<any[] | null>(null);
  const [selectedCasRows, setSelectedCasRows] = useState<number[]>([]);

  // Cashflow Form State
  const [newCfCategory, setNewCfCategory] = useState<string>("");
  const [newCfDescription, setNewCfDescription] = useState<string>("");
  const [newCfAmount, setNewCfAmount] = useState<number>(0);
  const [newCfFlowType, setNewCfFlowType] = useState<string>("EXPENSE");
  const [newCfDate, setNewCfDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Analytics Year Selector State
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  // Input DOM Refs for Keyboard Navigation Focus
  const horizonInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const cashflowInputRef = useRef<HTMLInputElement>(null);

  // Check auth user status on load
  useEffect(() => {
    checkUserExists();
  }, []);

  // Load database tables and resolve prices when unlocked and user session is set
  useEffect(() => {
    if (isUnlocked && loggedInUser) {
      loadResolvedAssets();
      loadCashflows();
    }
  }, [isUnlocked, loggedInUser]);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    if (!isUnlocked || isOnboarding) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab switcher: Alt + 1/2/3/4
      if (e.altKey && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "1") setActiveTab("horizon");
        if (e.key === "2") setActiveTab("assets");
        if (e.key === "3") setActiveTab("cashflow");
        if (e.key === "4") setActiveTab("analytics");
      }

      // Focus key: '/'
      const isInputActive = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT" || document.activeElement?.tagName === "TEXTAREA";
      if (e.key === "/" && !isInputActive) {
        e.preventDefault();
        if (activeTab === "horizon") horizonInputRef.current?.focus();
        if (activeTab === "assets") assetInputRef.current?.focus();
        if (activeTab === "cashflow") cashflowInputRef.current?.focus();
      }

      // New Entry shortcut: Ctrl+N or Alt+N
      if ((e.ctrlKey || e.metaKey || e.altKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (activeTab === "assets") {
          assetInputRef.current?.focus();
          setNewAssetCode("");
          setNewAssetUnits(0);
        } else if (activeTab === "cashflow") {
          cashflowInputRef.current?.focus();
          setNewCfCategory("");
          setNewCfDescription("");
          setNewCfAmount(0);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isUnlocked, isOnboarding, activeTab]);

  // 5-minute Auto-Lock Session Hook
  useEffect(() => {
    if (!isUnlocked) return;

    let timeoutId: number;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        handleLogout();
      }, 5 * 60 * 1000); // 5 minutes inactivity
    };

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isUnlocked]);

  // Reactive stress calculation
  useEffect(() => {
    if (isUnlocked && loggedInUser && result) {
      calculateFire();
    }
  }, [stressInflationSpike, stressMarketCrash]);

  // Auto-fill CAS password with PAN from settings if available
  useEffect(() => {
    if (casFile && panNumber && !casPassword) {
      setCasPassword(panNumber);
    }
  }, [casFile, panNumber]);

  async function checkUserExists() {
    try {
      const exists: boolean = await appInvoke("has_user");
      setHasLocalUser(exists);
    } catch (e) {
      console.error("Failed to query user status:", e);
    }
  }

  async function loadUserSettings(username: string) {
    try {
      const settings = await appInvoke("get_settings", { username });
      if (settings) {
        if (settings.gemini_api_key) {
          setGeminiApiKey(settings.gemini_api_key);
          setDashGeminiApiKey(settings.gemini_api_key);
        }
        setInflationRate(settings.inflation_rate);
        setNominalCagr(settings.nominal_cagr);
        setStepUpRate(settings.step_up_rate);
        setSwr(settings.swr);
        if (settings.pan_number) {
          setPanNumber(settings.pan_number);
        } else {
          setPanNumber("");
        }
        if (settings.pan_name) {
          setPanName(settings.pan_name);
        } else {
          setPanName("");
        }
      }
    } catch (err) {
      console.error("Failed to load user settings:", err);
    }
  }

  async function saveUserSettings(
    apiKeyToSave?: string, 
    infToSave?: number, 
    cagrToSave?: number, 
    stepUpToSave?: number, 
    swrToSave?: number,
    panNumberToSave?: string,
    panNameToSave?: string
  ) {
    if (!loggedInUser) return;
    try {
      await appInvoke("save_settings", {
        username: loggedInUser,
        geminiApiKey: apiKeyToSave !== undefined ? apiKeyToSave : geminiApiKey,
        inflationRate: infToSave !== undefined ? infToSave : inflationRate,
        nominalCagr: cagrToSave !== undefined ? cagrToSave : nominalCagr,
        stepUpRate: stepUpToSave !== undefined ? stepUpToSave : stepUpRate,
        swr: swrToSave !== undefined ? swrToSave : swr,
        panNumber: panNumberToSave !== undefined ? panNumberToSave : panNumber,
        panName: panNameToSave !== undefined ? panNameToSave : panName,
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    if (!authUsername.trim()) {
      setAuthError("Username is required.");
      return;
    }
    if (authPassword.length < 4) {
      setAuthError("Password must be at least 4 characters.");
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    try {
      const user = authUsername.trim();
      await appInvoke("register_user", {
        username: user,
        passwordRaw: authPassword,
      });
      setLoggedInUser(user);
      setIsUnlocked(true);
      setIsOnboarding(true);
      setOnboardingStep(1);
      // Create settings record
      await appInvoke("save_settings", {
        username: user,
        geminiApiKey: null,
        inflationRate: 0.09,
        nominalCagr: 0.13,
        stepUpRate: 0.10,
        swr: 0.035,
        panNumber: null,
        panName: null
      });
    } catch (err) {
      setAuthError(String(err));
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      const user = authUsername.trim();
      const success: boolean = await appInvoke("login_user", {
        username: user,
        passwordRaw: authPassword,
      });
      if (success) {
        setLoggedInUser(user);
        setIsUnlocked(true);
        await loadUserSettings(user);
        const rawCashflows: CashflowItem[] = await appInvoke("get_cashflow", { username: user });
        if (rawCashflows.length === 0) {
          setIsOnboarding(true);
          setOnboardingStep(1);
        } else {
          setIsOnboarding(false);
        }
      } else {
        setAuthError("Invalid username or password.");
      }
    } catch (err) {
      setAuthError(String(err));
    }
  }

  function handleLogout() {
    setIsUnlocked(false);
    setLoggedInUser("");
    setAuthUsername("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthError("");
    setExpandedAssetCode(null);
    checkUserExists();
  }

  async function loadResolvedAssets() {
    setIsResolving(true);
    try {
      const res: ResolvedAsset[] = await appInvoke("get_resolved_portfolio", { username: loggedInUser });
      setResolvedAssets(res);
      const netWorth = res.reduce((sum, asset) => sum + asset.value, 0);
      if (netWorth > 0) {
        setCurrentPortfolio(netWorth);
      }
    } catch (error) {
      console.error("Failed to resolve portfolio prices:", error);
    } finally {
      setIsResolving(false);
    }
  }

  async function loadCashflows() {
    try {
      const res: CashflowItem[] = await appInvoke("get_cashflow", { username: loggedInUser });
      setCashflows(res);
    } catch (error) {
      console.error("Failed to load cashflows from SQLite database:", error);
    }
  }

  async function calculateFire() {
    setIsCalculating(true);
    try {
      // Save current parameters on calculate
      await saveUserSettings(undefined, inflationRate, nominalCagr, stepUpRate, swr);

      const adjustedPortfolio = currentPortfolio * (1 - stressMarketCrash / 100);
      const adjustedInflation = inflationRate + (stressInflationSpike / 100);

      const res: SimulationResult = await appInvoke("calculate_fire", {
        currentPortfolio: adjustedPortfolio.toString(),
        lifestyleCost: lifestyleCost.toString(),
        inflationRate: adjustedInflation.toString(),
        nominalCagr: nominalCagr.toString(),
        stepUpRate: stepUpRate.toString(),
        years: years.toString(),
        swr: swr.toString(),
      });
      setResult(res);
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setIsCalculating(false);
    }
  }

  async function addAssetTransaction() {
    if (!newAssetCode.trim() || newAssetUnits <= 0 || newAssetBuyPrice <= 0) return;
    try {
      await appInvoke("add_transaction", {
        username: loggedInUser,
        assetType: newAssetType,
        code: newAssetCode.trim().toUpperCase(),
        buyPrice: newAssetBuyPrice,
        units: newAssetUnits,
        purchaseDate: newAssetPurchaseDate,
      });
      setNewAssetCode("");
      setNewAssetUnits(0);
      setNewAssetBuyPrice(0);
      setNewAssetPurchaseDate(new Date().toISOString().split("T")[0]);
      loadResolvedAssets();
    } catch (error) {
      console.error("Failed to save transaction:", error);
    }
  }

  async function deleteAsset(code: string) {
    try {
      const txs = await appInvoke("get_transactions", { username: loggedInUser, code });
      for (const tx of txs) {
        await appInvoke("remove_transaction", { username: loggedInUser, id: tx.id });
      }
      setExpandedAssetCode(null);
      loadResolvedAssets();
    } catch (error) {
      console.error("Failed to delete asset transactions:", error);
    }
  }

  async function deleteTransaction(id: number, code: string) {
    try {
      await appInvoke("remove_transaction", { username: loggedInUser, id });
      const txs = await appInvoke("get_transactions", { username: loggedInUser, code });
      setExpandedAssetTxs(txs);
      loadResolvedAssets();
    } catch (error) {
      console.error("Failed to delete transaction:", error);
    }
  }

  async function toggleAssetExpand(code: string) {
    if (expandedAssetCode === code) {
      setExpandedAssetCode(null);
      setExpandedAssetTxs([]);
    } else {
      setExpandedAssetCode(code);
      setLoadingTxs(true);
      try {
        const txs = await appInvoke("get_transactions", { username: loggedInUser, code });
        setExpandedAssetTxs(txs);
      } catch (err) {
        console.error("Failed to load transactions for asset:", err);
      } finally {
        setLoadingTxs(false);
      }
    }
  }

  const handleCasFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCasFile(e.target.files[0]);
      setCasParsedData(null);
    }
  };

  const handleCasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setCasFile(e.dataTransfer.files[0]);
      setCasParsedData(null);
    }
  };

  const decryptAndParseCas = () => {
    if (!casFile) return;
    setIsCasDecrypting(true);
    setTimeout(() => {
      setIsCasDecrypting(false);
      const mockParsed = [
        { id: 1, type: "MF", code: "120503", name: "Parag Parikh Flexi Cap Fund - Direct Growth", price: 55.30, units: 142.53, date: "2026-03-12" },
        { id: 2, type: "MF", code: "120186", name: "HDFC Index Nifty 50 Fund - Direct Growth", price: 35.60, units: 520.14, date: "2026-04-05" },
        { id: 3, type: "MF", code: "118825", name: "Mirae Asset Large Cap Fund - Direct Growth", price: 85.20, units: 310.45, date: "2026-04-18" },
        { id: 4, type: "STOCK", code: "RELIANCE.NS", name: "Reliance Industries Ltd.", price: 2910.00, units: 15.0, date: "2026-05-02" },
        { id: 5, type: "STOCK", code: "TCS.NS", name: "Tata Consultancy Services Ltd.", price: 3850.00, units: 5.0, date: "2026-05-15" }
      ];
      setCasParsedData(mockParsed);
      setSelectedCasRows(mockParsed.map(item => item.id));
    }, 2000);
  };

  const importCasTransactions = async () => {
    if (!casParsedData) return;
    const itemsToImport = casParsedData.filter(item => selectedCasRows.includes(item.id));
    try {
      for (const item of itemsToImport) {
        await appInvoke("add_transaction", {
          username: loggedInUser,
          assetType: item.type,
          code: item.code,
          buyPrice: item.price,
          units: item.units,
          purchaseDate: item.date
        });
      }
      setCasFile(null);
      setCasPassword("");
      setCasParsedData(null);
      setSelectedCasRows([]);
      setLedgerInputMethod("manual");
      loadResolvedAssets();
    } catch (e) {
      console.error("Failed to import CAS transactions:", e);
    }
  };

  const toggleCasRow = (id: number) => {
    if (selectedCasRows.includes(id)) {
      setSelectedCasRows(selectedCasRows.filter(r => r !== id));
    } else {
      setSelectedCasRows([...selectedCasRows, id]);
    }
  };

  async function addCashflow() {
    if (!newCfCategory.trim() || newCfAmount <= 0) return;
    try {
      await appInvoke("add_cashflow", {
        username: loggedInUser,
        category: newCfCategory.trim(),
        description: newCfDescription.trim() || null,
        amount: newCfAmount,
        flowType: newCfFlowType,
        date: newCfDate,
      });
      setNewCfCategory("");
      setNewCfDescription("");
      setNewCfAmount(0);
      loadCashflows();
    } catch (error) {
      console.error("Failed to save cashflow:", error);
    }
  }

  async function deleteCashflow(id: number) {
    try {
      await appInvoke("remove_cashflow", { username: loggedInUser, id });
      loadCashflows();
    } catch (error) {
      console.error("Failed to delete cashflow:", error);
    }
  }

  // Handle Onboarding Completion
  async function completeOnboarding() {
    try {
      const today = new Date().toISOString().split("T")[0];
      await appInvoke("add_cashflow", {
        username: loggedInUser,
        category: "Salary (Onboarding)",
        description: "Baseline Monthly Income",
        amount: obIncome,
        flowType: "INCOME",
        date: today,
      });

      await appInvoke("add_cashflow", {
        username: loggedInUser,
        category: "Fixed Expenses (Onboarding)",
        description: "Baseline Fixed Burn Rate",
        amount: obFixed,
        flowType: "EXPENSE",
        date: today,
      });

      await appInvoke("add_cashflow", {
        username: loggedInUser,
        category: "Variable Expenses (Onboarding)",
        description: "Baseline Variable Burn Rate",
        amount: obVariable,
        flowType: "EXPENSE",
        date: today,
      });

      setLifestyleCost(obFixed + obVariable);
      setCurrentPortfolio(0);

      // Save settings too
      await saveUserSettings(geminiApiKey, undefined, undefined, undefined, undefined, panNumber, panName);

      setIsOnboarding(false);
      loadCashflows();
      setActiveTab("horizon");
    } catch (e) {
      console.error("Failed to complete onboarding database insertions:", e);
    }
  }

  // Trigger Gemini AI Call during onboarding
  async function runAiAvenuesAnalysis() {
    if (!geminiApiKey.trim()) return;
    setAiLoading(true);
    setAiAnalysis("");
    try {
      const targetStr = obCustomFireTarget > 0 ? obCustomFireTarget : normalFireNum;
      const savingsRateVal = obIncome > 0 ? (((obIncome - (obFixed + obVariable)) / obIncome) * 100).toFixed(1) : "0";

      const prompt = `You are a financial advisor expert in Indian tax codes, TDS, labor laws, NPS, Mutual Funds, and Stocks.
A user has the following profile:
- Monthly Income: Rs. ${obIncome}
- Monthly Fixed Expenses: Rs. ${obFixed}
- Monthly Variable Expenses: Rs. ${obVariable}
- Current Savings Rate: ${savingsRateVal}%
- Chosen FIRE Target Net Worth: Rs. ${targetStr.toLocaleString()}

Recommend:
1. Savings avenues in India to optimize taxes (specifically under Section 80C, 80D, and NPS Section 80CCD(1B)).
2. Asset Allocation strategy between Equity Mutual Funds, Debt, NPS, and Stocks based on their cashflow.
3. TDS and Labor Law benefits (e.g. EPF/PF employer contributions, Gratuity, and CTC structure optimization).
Keep it extremely structured, concise, and highly actionable.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to receive advice from Gemini. Please check your API key.";
      setAiAnalysis(text);
    } catch (e) {
      setAiAnalysis(`Error communicating with Gemini API: ${e}`);
    } finally {
      setAiLoading(false);
    }
  }

  // Trigger Gemini AI Call in Dashboard (Advanced Panel)
  async function runDashboardAiAnalysis() {
    if (!dashGeminiApiKey.trim()) return;
    setDashAiLoading(true);
    setDashAiAnalysis("");
    try {
      const activeNetWorth = ledgerNetWorth > 0 ? ledgerNetWorth : currentPortfolio;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${dashGeminiApiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are an expert continuous calculus financial engine advisor.
Generate an advanced wealth recommendation report for user "${loggedInUser}":
- Total Current Portfolio/Ledger Worth: ₹${activeNetWorth.toLocaleString()}
- Monthly Lifestyle Cost target: ₹${lifestyleCost.toLocaleString()}
- Horizon timeline set: ${years} Years
- Inflation: ${(inflationRate * 100).toFixed(1)}%, Nominal CAGR: ${(nominalCagr * 100).toFixed(1)}%, SWR: ${(swr * 100).toFixed(2)}%

Suggest:
1. Precise allocation in Equity Mutual Funds vs Active Stocks to beat the ${(inflationRate * 100).toFixed(1)}% inflation deflator.
2. Under Indian Income Tax regimes, detail optimization routes for a net worth of ₹${activeNetWorth.toLocaleString()}.
3. Gratuity and EPF/NPS limits for wealth preservation.
Keep it highly analytical, mathematically sound, and formatted cleanly.`
              }]
            }],
          }),
        }
      );

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to receive advice from Gemini. Please check your API key.";
      setDashAiAnalysis(text);
    } catch (e) {
      setDashAiAnalysis(`Error: ${e}`);
    } finally {
      setDashAiLoading(false);
    }
  }

  // Calculations for Onboarding On-the-fly Results
  const monthlyLifestyle = obFixed + obVariable;
  const netSavings = obIncome - monthlyLifestyle;
  const savingsRateVal = obIncome > 0 ? ((netSavings / obIncome) * 100) : 0;
  
  // Calculate FIRE targets
  const targetSwr = 0.035; // 3.5%
  const leanFireNum = Math.round((monthlyLifestyle * 0.75 * 12) / targetSwr);
  const normalFireNum = Math.round((monthlyLifestyle * 12) / targetSwr);
  const cozyFireNum = Math.round((monthlyLifestyle * 1.25 * 12) / targetSwr);
  const fatFireNum = Math.round((monthlyLifestyle * 1.50 * 12) / targetSwr);

  // Set default custom target based on type
  useEffect(() => {
    if (obFireType === "lean") setObCustomFireTarget(leanFireNum);
    if (obFireType === "normal") setObCustomFireTarget(normalFireNum);
    if (obFireType === "cozy") setObCustomFireTarget(cozyFireNum);
    if (obFireType === "fat") setObCustomFireTarget(fatFireNum);
  }, [obFireType, leanFireNum, normalFireNum, cozyFireNum, fatFireNum]);

  // Format data for Horizon AreaChart
  const chartDataCombined = result?.nominal_trajectory.map((nom, index) => ({
    month: index + 1,
    nominal: nom,
    real: result.real_trajectory[index],
  })) || [];

  // Group cashflows for Monthly Budget Analyser
  const monthlyDataMap: { [key: string]: { month: string; income: number; expense: number; investment: number } } = {};
  cashflows.forEach((cf) => {
    const my = getMonthYear(cf.date);
    if (!monthlyDataMap[my]) {
      monthlyDataMap[my] = { month: my, income: 0, expense: 0, investment: 0 };
    }
    if (cf.flow_type === "INCOME") {
      monthlyDataMap[my].income += cf.amount;
    } else if (cf.flow_type === "EXPENSE") {
      monthlyDataMap[my].expense += cf.amount;
    } else if (cf.flow_type === "INVESTMENT") {
      monthlyDataMap[my].investment += cf.amount;
    }
  });

  const sortedMonthlyBudgetData = Object.values(monthlyDataMap).sort((a, b) => {
    const parseMonthYear = (s: string) => {
      const [mStr, yStr] = s.split(" ");
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const m = months.indexOf(mStr);
      const y = parseInt(yStr, 10);
      return new Date(y, m, 1).getTime();
    };
    return parseMonthYear(a.month) - parseMonthYear(b.month);
  });

  // Calculate unique years available in database
  const availableYears = Array.from(new Set(cashflows.map((cf) => getYear(cf.date)))).sort().reverse();
  const displayYear = selectedYear || (availableYears[0] || new Date().getFullYear().toString());

  // Category breakdown for selected year
  const categoryDataMap: { [key: string]: number } = {};
  let totalYearlyExpense = 0;
  cashflows.forEach((cf) => {
    if (getYear(cf.date) === displayYear && cf.flow_type === "EXPENSE") {
      categoryDataMap[cf.category] = (categoryDataMap[cf.category] || 0) + cf.amount;
      totalYearlyExpense += cf.amount;
    }
  });

  const yearlyCategoryList = Object.entries(categoryDataMap)
    .map(([category, amount]) => ({
      name: category,
      value: amount,
      percentage: totalYearlyExpense > 0 ? (amount / totalYearlyExpense) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Total resolved net worth
  const ledgerNetWorth = resolvedAssets.reduce((sum, asset) => sum + asset.value, 0);

  // ---------------------------------------------------------
  // RENDER AUTHENTICATION LAYER
  // ---------------------------------------------------------
  if (!isUnlocked) {
    return (
      <div className="min-h-screen metallic-bg flex flex-col items-center justify-center p-6 selection:bg-lime-500/20 text-white relative overflow-hidden">
        
        <div className="w-full max-w-md metallic-card p-8 relative shadow-2xl z-10 border border-zinc-700/40">
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 w-16 bg-lime-500/10 rounded-2xl flex items-center justify-center border border-lime-500/25 mb-4 shadow-inner">
              <Shield className="h-8 w-8 text-lime-400" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-chrome-silver font-heading">FinancialsOS</h1>
            <p className="text-rose-gold text-xs uppercase tracking-widest mt-1.5 font-extrabold">Vault Authentication</p>
          </div>

          <form onSubmit={hasLocalUser ? handleLogin : handleRegister} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-1">Username</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="e.g. debansh"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full rounded-xl bg-black pl-10 pr-3 py-2.5 text-white border border-zinc-800 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 font-sans"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-1">Vault Key / Password</label>
              <div className="relative">
                <Key className="absolute left-3 top-3.5 h-4 w-4 text-zinc-550" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full rounded-xl bg-black pl-10 pr-3 py-2.5 text-white border border-zinc-800 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 font-sans"
                />
              </div>
            </div>

            {!hasLocalUser && (
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-1">Confirm Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3.5 h-4 w-4 text-zinc-550" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    className="w-full rounded-xl bg-black pl-10 pr-3 py-2.5 text-white border border-zinc-800 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 font-sans"
                  />
                </div>
              </div>
            )}

            {authError && (
              <div className="p-3 bg-red-950/30 border border-red-800/40 text-red-500 rounded-xl text-xs flex gap-2">
                <span>⚠️</span>
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 via-lime-500 to-lime-600 hover:from-lime-300 hover:to-lime-500 py-3 font-extrabold text-black transition-all shadow-lg shadow-lime-900/30 active:scale-[0.98] border border-lime-400"
            >
              {hasLocalUser ? (
                <>
                  <Lock className="h-4 w-4" /> Unlock Vault
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Initialize Relational Vault
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-zinc-500">
            {hasLocalUser ? (
              <p className="text-zinc-450">Chrome-Silver cryptography ensures zero-leak security.</p>
            ) : (
              <p className="text-zinc-450">No database detected. Input a local key to encrypt SQLite files.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // RENDER ONBOARDING FLOW
  // ---------------------------------------------------------
  if (isOnboarding) {
    return (
      <div className="min-h-screen metallic-bg flex flex-col justify-between p-8 selection:bg-lime-500/20 text-white relative">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-zinc-900 pb-4 relative z-10">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-lime-400" />
            <span className="font-extrabold tracking-tight font-heading text-lg text-chrome-silver">FinancialsOS</span>
            <span className="rounded bg-zinc-950 text-[9px] border border-zinc-800 text-rose-gold px-2.5 py-0.5 uppercase font-bold">Onboarding Journey</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-2 w-12 rounded-full transition-all ${
                  onboardingStep >= step ? "bg-lime-500" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>
        </header>

        {/* Form Container */}
        <main className="max-w-4xl w-full mx-auto my-12 relative z-10 flex flex-col justify-center min-h-[50vh]">
          
          {/* STEP 1: Monthly Income and Expenses Input */}
          {onboardingStep === 1 && (
            <div className="metallic-card p-8 flex flex-col justify-between max-w-2xl mx-auto w-full">
              <div>
                <h2 className="text-2xl font-extrabold text-white mb-2 font-heading">Set Your Baseline Cashflow</h2>
                <p className="text-sm text-zinc-400 mb-8 font-sans">Enter your baseline monthly earnings and split your expenses to evaluate your savings launching pad.</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">Baseline Monthly Income (₹)</label>
                    <input
                      type="number"
                      value={obIncome}
                      onChange={(e) => setObIncome(Number(e.target.value))}
                      className="w-full rounded-xl bg-black px-4 py-3 text-white border border-zinc-800 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 font-mono text-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">Fixed Expenses (₹) <span className="text-zinc-550 font-normal">(Rent, EMIs, Bills, Food)</span></label>
                      <input
                        type="number"
                        value={obFixed}
                        onChange={(e) => setObFixed(Number(e.target.value))}
                        className="w-full rounded-xl bg-black px-4 py-3 text-white border border-zinc-800 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 font-mono text-base"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">Variable Expenses (₹) <span className="text-zinc-550 font-normal">(Leisure, Dining Out, Shopping)</span></label>
                      <input
                        type="number"
                        value={obVariable}
                        onChange={(e) => setObVariable(Number(e.target.value))}
                        className="w-full rounded-xl bg-black px-4 py-3 text-white border border-zinc-800 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 font-mono text-base"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setOnboardingStep(2)}
                  disabled={obIncome <= 0 || (obFixed + obVariable) <= 0}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 to-lime-650 hover:from-lime-300 hover:to-lime-550 px-6 py-3 font-extrabold text-black transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  Analyze Savings & Sinks <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: i. Money Sinks & Savings Potential */}
          {onboardingStep === 2 && (
            <div className="metallic-card p-8 flex flex-col justify-between max-w-2xl mx-auto w-full">
              <div>
                <span className="text-xs font-bold text-rose-gold uppercase tracking-wider bg-[#b76e79]/10 px-2.5 py-1 rounded-full border border-[#b76e79]/20">i. Budget Analysis</span>
                <h2 className="text-2xl font-extrabold text-white mt-4 mb-2 font-heading">Money Sinks & Savings Potential</h2>
                <p className="text-sm text-zinc-400 mb-6">Evaluating your current budget efficiency and identifying leverage points.</p>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-black border border-zinc-800 text-center shadow-inner">
                      <p className="text-xs text-zinc-500">Monthly Surplus</p>
                      <p className={`text-xl font-bold font-mono mt-1 ${netSavings > 0 ? "text-emerald-450" : "text-red-500"}`}>
                        ₹{netSavings.toLocaleString()}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-black border border-zinc-800 text-center shadow-inner">
                      <p className="text-xs text-zinc-500">Savings Rate</p>
                      <p className={`text-xl font-bold font-mono mt-1 ${savingsRateVal > 30 ? "text-emerald-400" : savingsRateVal > 10 ? "text-amber-500" : "text-red-500"}`}>
                        {savingsRateVal.toFixed(1)}%
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-black border border-zinc-800 text-center shadow-inner">
                      <p className="text-xs text-zinc-500">Expense Ratio</p>
                      <p className="text-xl font-bold font-mono mt-1 text-zinc-300">
                        {obIncome > 0 ? (((obFixed + obVariable) / obIncome) * 100).toFixed(0) : 100}%
                      </p>
                    </div>
                  </div>

                  {netSavings <= 0 ? (
                    <div className="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-sm text-red-400 leading-relaxed shadow-sm">
                      ⚠️ <strong>Warning:</strong> Your monthly burn rate (₹{monthlyLifestyle.toLocaleString()}) matches or exceeds your income! You must reduce expenses or expand your income stream to start building a positive surplus.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-lime-950/15 border border-lime-500/20 text-sm text-lime-305 leading-relaxed">
                        🔍 <strong>Primary Money Sink:</strong> Your variable expenses (₹{obVariable.toLocaleString()}) represent <strong>{((obVariable / monthlyLifestyle) * 100).toFixed(0)}%</strong> of your total outflow. Unlike fixed rents or loans, this represents your easiest money leak to optimize.
                      </div>

                      <div className="p-4 rounded-xl bg-black border border-zinc-800 text-sm leading-relaxed text-zinc-300">
                        💡 <strong>Potential Savings Scenario:</strong>
                        <p className="text-zinc-450 mt-1">
                          Trimming variable expenses by just <strong>15%</strong> recovers <strong className="text-lime-400">₹{(obVariable * 0.15).toLocaleString()}</strong> monthly. This elevates your net savings to <strong className="text-lime-400">₹{(netSavings + obVariable * 0.15).toLocaleString()}</strong>, boosting your savings rate to <strong className="text-lime-400">{(((obIncome - (obFixed + obVariable * 0.85)) / obIncome) * 100).toFixed(1)}%</strong> for accelerated compounding.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setOnboardingStep(1)}
                  className="px-6 py-3 font-semibold text-zinc-400 hover:text-white transition-colors bg-zinc-950 rounded-xl border border-zinc-800"
                >
                  Back
                </button>
                <button
                  onClick={() => setOnboardingStep(3)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 to-lime-650 hover:from-lime-300 hover:to-lime-550 px-6 py-3 font-extrabold text-black transition-all active:scale-[0.98] border border-lime-400"
                >
                  Configure FIRE Target <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: ii. Choose Your FIRE Target */}
          {onboardingStep === 3 && (
            <div className="metallic-card p-8 flex flex-col justify-between w-full max-w-3xl mx-auto">
              <div>
                <span className="text-xs font-bold text-rose-gold uppercase tracking-wider bg-[#b76e79]/10 px-2.5 py-1 rounded-full border border-[#b76e79]/20">ii. Financial Target</span>
                <h2 className="text-2xl font-extrabold text-white mt-4 mb-2 font-heading">Choose Your FIRE Target</h2>
                <p className="text-sm text-zinc-400 mb-8">We have generated four financial independence targets based on your current lifestyle cost. Pick a model or customize it.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {[
                    { type: "lean", name: "Lean FIRE (75% lifestyle)", val: leanFireNum, desc: "Frugal retirement model covering core basic needs." },
                    { type: "normal", name: "Normal FIRE (100% lifestyle)", val: normalFireNum, desc: "Standard retirement model mirroring current expenditure." },
                    { type: "cozy", name: "Cozy FIRE (125% lifestyle)", val: cozyFireNum, desc: "Comfortable retirement model allowing extra buffer." },
                    { type: "fat", name: "Fat FIRE (150% lifestyle)", val: fatFireNum, desc: "Affluent retirement model enabling high discretionary spend." },
                  ].map((item) => (
                    <label
                      key={item.type}
                      className={`flex flex-col justify-between p-4 rounded-xl cursor-pointer transition-all ${
                        obFireType === item.type
                          ? "metallic-card-gold text-white border border-[#b76e79] shadow-lg shadow-[#b76e79]/10"
                          : "bg-black border border-zinc-850 text-zinc-450 hover:border-zinc-700 rounded-xl"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="obFireRadio"
                            checked={obFireType === item.type}
                            onChange={() => setObFireType(item.type as any)}
                            className="accent-lime-500"
                          />
                          <span className="font-bold text-sm text-white">{item.name}</span>
                        </div>
                        <span className="font-mono font-bold text-sm text-rose-gold">₹{(item.val / 10000000).toFixed(2)} Cr</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2">{item.desc}</p>
                    </label>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-black border border-zinc-855 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-inner">
                  <div className="flex-1">
                    <label className="text-xs text-zinc-300 block mb-1 font-semibold">Adjust or Increase Your FIRE Target (₹)</label>
                    <p className="text-[10px] text-zinc-500 font-sans">Increase your target net worth cushion to customize your horizons.</p>
                  </div>
                  <input
                    type="number"
                    value={obCustomFireTarget}
                    onChange={(e) => setObCustomFireTarget(Number(e.target.value))}
                    className="w-full md:w-64 rounded-lg bg-zinc-950 px-3 py-2 text-white border border-zinc-800 text-sm font-mono focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setOnboardingStep(2)}
                  className="px-6 py-3 font-semibold text-zinc-400 hover:text-white transition-colors bg-zinc-950 rounded-xl border border-zinc-800"
                >
                  Back
                </button>
                <button
                  onClick={() => setOnboardingStep(4)}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 to-lime-650 hover:from-lime-300 hover:to-lime-550 px-6 py-3 font-extrabold text-black transition-all active:scale-[0.98] border border-lime-400"
                >
                  Optimize Savings Avenues <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: iii. Savings Avenues & Advanced AI Features */}
          {onboardingStep === 4 && (
            <div className="metallic-card p-8 flex flex-col justify-between w-full max-w-3xl mx-auto space-y-6">
              <div>
                <span className="text-xs font-bold text-rose-gold uppercase tracking-wider bg-[#b76e79]/10 px-2.5 py-1 rounded-full border border-[#b76e79]/20">iii. Investment Avenues</span>
                <h2 className="text-2xl font-extrabold text-white mt-4 mb-2 font-heading">Avenues for Higher Savings</h2>
                <p className="text-sm text-zinc-400 mb-6 font-sans">Allocate your monthly surplus of <strong>₹{netSavings.toLocaleString()}</strong> into wealth-building vehicles. Setup our core suggested indexes below or configure advanced AI personalization.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                  {/* Left Column: Standard Allocation & PAN Configuration */}
                  <div className="p-5 bg-black rounded-xl border border-zinc-800 flex flex-col justify-between space-y-4 shadow-inner">
                    <div>
                      <h4 className="text-xs font-bold uppercase text-zinc-400 tracking-wider mb-3">Suggested Passive Allocation</h4>
                      <div className="space-y-2 text-xs text-zinc-300">
                        <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                          <span>Index Mutual Funds (70%)</span>
                          <span className="font-mono text-white">₹{Math.round(netSavings * 0.7).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                          <span>Stocks & ETFs (30%)</span>
                          <span className="font-mono text-white">₹{Math.round(netSavings * 0.3).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-900 space-y-2">
                      <h4 className="text-xs font-bold uppercase text-rose-gold tracking-wider">PAN Details (For CAMS PDF Auto-Decrypt)</h4>
                      <p className="text-[10px] text-zinc-500 leading-tight">Enable seamless parsing & decryption of CAMS consolidated account statements.</p>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>
                          <label className="text-[8px] text-zinc-450 uppercase font-semibold block mb-0.5">Holder Name</label>
                          <input
                            type="text"
                            placeholder="e.g. JOHN DOE"
                            value={panName}
                            onChange={(e) => setPanName(e.target.value)}
                            className="w-full rounded-lg bg-zinc-950 px-2 py-1 text-white border border-zinc-900 text-xs focus:outline-none focus:border-[#b76e79]"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-zinc-450 uppercase font-semibold block mb-0.5">PAN Card Number</label>
                          <input
                            type="text"
                            placeholder="e.g. ABCDE1234F"
                            value={panNumber}
                            onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                            className="w-full rounded-lg bg-zinc-950 px-2 py-1 text-white border border-zinc-900 text-xs font-mono focus:outline-none focus:border-[#b76e79]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Advanced AI Configuration */}
                  <div className="p-5 bg-black border border-[#b76e79]/40 rounded-xl flex flex-col justify-between space-y-4 metallic-card-gold shadow-md">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="text-xs font-extrabold uppercase text-[#e5c2c0] tracking-wider flex items-center gap-1">
                          <Brain className="h-3.5 w-3.5 text-[#b76e79]" /> Advanced AI Planner
                        </h4>
                        <span className="text-[8px] bg-[#b76e79]/20 text-[#e5c2c0] px-1.5 py-0.5 rounded font-extrabold uppercase border border-[#b76e79]/30">Advanced API</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed mb-4 font-sans">Integrate your own Google Gemini API key to run continuous simulations matching EPF, NPS, TDS brackets, and gratuity projections.</p>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] text-zinc-400 block font-semibold">Gemini API Key:</label>
                        <input
                          type="password"
                          placeholder="Paste Gemini API Key..."
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          className="w-full rounded-lg bg-zinc-950 px-3 py-1.5 text-white border border-zinc-800 text-xs font-mono focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
                        />
                      </div>
                    </div>

                    <button
                      onClick={runAiAvenuesAnalysis}
                      disabled={aiLoading || !geminiApiKey.trim()}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-rose-gold text-black font-extrabold hover:opacity-90 text-xs py-2.5 transition-all shadow-lg shadow-[#b76e79]/25 active:scale-[0.98]"
                    >
                      <Brain className="h-3.5 w-3.5" />
                      {aiLoading ? "Simulating Strategy..." : "Analyze with Advanced AI"}
                    </button>
                  </div>
                </div>

                {/* AI response panel */}
                {aiAnalysis && (
                  <div className="bg-black border border-[#b76e79]/40 p-5 rounded-xl metallic-card-gold shadow-md">
                    <h4 className="text-xs font-semibold text-[#e5c2c0] flex items-center gap-2 mb-3">
                      <Brain className="h-4 w-4 text-[#b76e79]" /> Advanced Strategy Projections (Gemini AI Output)
                    </h4>
                    <div className="bg-black p-4 rounded-lg border border-zinc-900 whitespace-pre-wrap text-[11px] font-sans text-zinc-300 leading-relaxed max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-850 border-chrome-silver-gradient">
                      {aiAnalysis}
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-zinc-900">
                <button
                  onClick={() => setOnboardingStep(3)}
                  className="px-6 py-3 font-semibold text-zinc-450 hover:text-white transition-colors bg-zinc-950 rounded-xl border border-zinc-800"
                >
                  Back to FIRE Target
                </button>
                <button
                  onClick={completeOnboarding}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 to-lime-650 hover:from-lime-300 hover:to-lime-550 px-6 py-3 font-extrabold text-black transition-all active:scale-[0.98] border border-lime-400 shadow-lg shadow-lime-900/30"
                >
                  Complete Onboarding & Start OS <CheckCircle className="h-4 w-4 text-black" />
                </button>
              </div>
            </div>
          )}
        </main>

        <footer className="text-center text-xs text-zinc-600 relative z-10 pb-4">
          FinancialsOS is local-first. Chrome-Silver schemas protect database storage inside your SQLite relational ledger.
        </footer>
      </div>
    );
  }

  // ---------------------------------------------------------
  // RENDER MAIN APPLICATION DASHBOARD
  // ---------------------------------------------------------
  return (
    <div className="min-h-screen metallic-bg p-8 font-sans selection:bg-lime-500/20 text-white flex flex-col justify-between">
      
      <div className="relative z-10">
        {/* HEADER WITH NAVIGATION */}
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-zinc-850 pb-6 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-lime-400" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-chrome-silver font-heading">FinancialsOS</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="rounded bg-zinc-950 px-2 py-0.5 text-[9px] text-rose-gold border border-[#b76e79]/30 uppercase font-extrabold tracking-wider shadow-sm">Chrome-Silver Ledger</span>
                <span className="text-[11px] text-zinc-400">Vault: <strong className="text-zinc-200">{loggedInUser}</strong></span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="ml-3 flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-700 hover:text-white transition-colors"
              title="Lock and Secure Session"
            >
              <LogOut className="h-3.5 w-3.5" /> Lock
            </button>
          </div>
          
          <div className="flex flex-wrap bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab("horizon")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "horizon" ? "bg-gradient-to-r from-lime-400 to-lime-500 text-black font-extrabold border border-lime-400 shadow-md shadow-lime-900/10" : "text-zinc-400 hover:text-white"
              }`}
            >
              🎯 Horizon Engine
            </button>
            <button
              onClick={() => setActiveTab("assets")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "assets" ? "bg-gradient-to-r from-lime-400 to-lime-500 text-black font-extrabold border border-lime-400 shadow-md shadow-lime-900/10" : "text-zinc-400 hover:text-white"
              }`}
            >
              📊 Asset Ledger
            </button>
            <button
              onClick={() => setActiveTab("cashflow")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "cashflow" ? "bg-gradient-to-r from-lime-400 to-lime-500 text-black font-extrabold border border-lime-400 shadow-md shadow-lime-900/10" : "text-zinc-400 hover:text-white"
              }`}
            >
              💸 Cashflow Tracker
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "analytics" ? "bg-gradient-to-r from-lime-400 to-lime-500 text-black font-extrabold border border-lime-400 shadow-md shadow-lime-900/10" : "text-zinc-400 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1 font-sans">
                <BarChart3 className="h-4 w-4" /> Analytics
              </span>
            </button>
          </div>
        </header>

        {/* TABS CONTAINER */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          
          {/* TAB 1: Horizon Projections */}
          {activeTab === "horizon" && (
            <>
              {/* SIDEBAR: Controls */}
              <div className="space-y-6 metallic-card p-6 border border-zinc-800">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-200">
                  <Activity className="h-5 w-5 text-lime-450" /> System Parameters
                </h2>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    calculateFire();
                  }}
                  className="space-y-4"
                >
                  <div>
                    <div className="mb-1 flex justify-between">
                      <label className="text-xs text-zinc-400 uppercase font-semibold">Current Portfolio (₹)</label>
                      {ledgerNetWorth > 0 && (
                        <button
                          type="button"
                          onClick={() => setCurrentPortfolio(ledgerNetWorth)}
                          className="text-xs text-lime-450 hover:text-lime-450 hover:underline font-semibold"
                        >
                          Use Ledger (₹{ledgerNetWorth.toLocaleString()})
                        </button>
                      )}
                    </div>
                    <input
                      ref={horizonInputRef}
                      type="number"
                      value={currentPortfolio}
                      onChange={(e) => setCurrentPortfolio(Number(e.target.value))}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400 uppercase font-semibold">Lifestyle Cost / Month (₹)</label>
                    <input
                      type="number"
                      value={lifestyleCost}
                      onChange={(e) => setLifestyleCost(Number(e.target.value))}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-400 uppercase font-semibold">Annual Inflation (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={inflationRate}
                        onChange={(e) => setInflationRate(Number(e.target.value))}
                        className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-400 uppercase font-semibold">Nominal CAGR (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={nominalCagr}
                        onChange={(e) => setNominalCagr(Number(e.target.value))}
                        className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-400 uppercase font-semibold">Annual Step-Up (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={stepUpRate}
                        onChange={(e) => setStepUpRate(Number(e.target.value))}
                        className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-400 uppercase font-semibold">Safe Withdrawal (%)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={swr}
                        onChange={(e) => setSwr(Number(e.target.value))}
                        className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400 uppercase font-semibold">Horizon Timeline (Years)</label>
                    <input
                      type="number"
                      value={years}
                      onChange={(e) => setYears(Number(e.target.value))}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isCalculating}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 to-lime-650 hover:from-lime-300 hover:to-lime-550 py-3 font-extrabold text-black transition-all shadow-md active:scale-[0.98] border border-lime-400"
                  >
                    {isCalculating ? "Simulating Horizons..." : "Run Horizonal Calculus"}
                  </button>
                </form>

                {/* Collapsible Tail-Risk Stress Testing Slider Panel */}
                <div className="mt-4 pt-4 border-t border-zinc-850 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowStressPanel(!showStressPanel)}
                    className="w-full flex items-center justify-between text-xs font-bold text-[#e5c2c0] uppercase tracking-wider hover:text-white transition-colors"
                  >
                    <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-[#b76e79]" /> Tail-Risk Stress Testing</span>
                    <span className="font-mono text-[10px]">{showStressPanel ? "[-]" : "[+]"}</span>
                  </button>
                  
                  {showStressPanel && (
                    <div className="space-y-4 pt-2 border-t border-zinc-900">
                      <div>
                        <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                          <span>Inflation Spike</span>
                          <span className="font-mono text-red-500 font-bold">+{stressInflationSpike}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="15"
                          step="0.5"
                          value={stressInflationSpike}
                          onChange={(e) => {
                            setStressInflationSpike(parseFloat(e.target.value));
                          }}
                          className="w-full accent-red-500 h-1 bg-zinc-850 rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] text-zinc-500 block leading-tight mt-1">Simulates up to 15% extra annual inflation.</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] text-zinc-450 mb-1">
                          <span>Immediate Crash Event</span>
                          <span className="font-mono text-red-500 font-bold">-{stressMarketCrash}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          step="1"
                          value={stressMarketCrash}
                          onChange={(e) => {
                            setStressMarketCrash(parseFloat(e.target.value));
                          }}
                          className="w-full accent-red-500 h-1 bg-zinc-850 rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] text-zinc-500 block leading-tight mt-1">Simulates an immediate stock/mutual fund crash.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* MAIN: Result Projections */}
              <div className="col-span-1 flex flex-col space-y-6 md:col-span-2">
                {result ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-2xl border border-lime-500/30 bg-lime-950/20 p-5 shadow-md">
                        <p className="flex items-center gap-2 text-sm text-lime-400 font-semibold uppercase tracking-wider text-[11px]">
                          <Target className="h-4 w-4" /> Required Monthly SIP
                        </p>
                        <p className="text-2xl font-bold text-lime-400 font-heading mt-1">₹{result.optimal_sip.toLocaleString()}</p>
                      </div>

                      <div className="metallic-card p-5">
                        <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">True FIRE Target (Today)</p>
                        <p className="text-2xl font-bold text-white font-heading mt-1">₹{(result.true_fire_today / 10000000).toFixed(2)} Cr</p>
                      </div>

                      <div className="metallic-card p-5">
                        <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Nominal Target ({years} Yrs)</p>
                        <p className="text-2xl font-bold text-zinc-300 font-heading mt-1">₹{(result.nominal_target / 10000000).toFixed(2)} Cr</p>
                      </div>
                    </div>

                    <div className="flex-1 metallic-card p-6">
                      <h3 className="mb-6 text-lg font-semibold text-zinc-205 font-heading">Trajectory: Nominal vs. True Purchasing Power</h3>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartDataCombined} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="month" stroke="#52525b" tickFormatter={(val) => `Yr ${Math.floor(val / 12)}`} />
                            <YAxis stroke="#52525b" tickFormatter={(val) => `₹${(val / 10000000).toFixed(1)}Cr`} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#050505", borderColor: "rgba(255,255,255,0.08)", borderRadius: "8px", color: "#ffffff" }}
                              formatter={(value: any) => [`₹${(Number(value) / 100000).toFixed(2)} L`, ""]}
                            />
                            {/* Royal Blue for Nominal projection, Neon Green for Real power projection */}
                            <Area type="monotone" dataKey="nominal" stroke="#2563eb" fill="transparent" strokeDasharray="5 5" name="Nominal Value (Royal Blue)" />
                            <Area type="monotone" dataKey="real" stroke="#22c55e" fillOpacity={1} fill="url(#colorReal)" name="Real Power (Neon Green)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 text-zinc-550">
                    <Activity className="mb-4 h-12 w-12 opacity-50 text-lime-450" />
                    <p className="font-semibold text-zinc-400">Enter parameters and run calculus simulation.</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: Asset Ledger */}
          {activeTab === "assets" && (
            <>
              {/* SIDEBAR: Controls & PDF Parser */}
              <div className="space-y-6">
                
                {/* Input Method Selector Card */}
                <div className="metallic-card p-6 space-y-4">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-200">
                    <Wallet className="h-5 w-5 text-lime-400" /> Ledger Input Mode
                  </h2>
                  <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-900">
                    <button
                      onClick={() => setLedgerInputMethod("manual")}
                      className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all ${
                        ledgerInputMethod === "manual" ? "bg-gradient-to-r from-lime-400 to-lime-600 text-black border border-lime-400 font-extrabold" : "text-zinc-500 hover:text-zinc-350"
                      }`}
                    >
                      Manual Entry
                    </button>
                    <button
                      onClick={() => setLedgerInputMethod("cas")}
                      className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all ${
                        ledgerInputMethod === "cas" ? "bg-rose-gold text-black border border-[#b76e79] font-extrabold" : "text-zinc-500 hover:text-zinc-350"
                      }`}
                    >
                      CAMS / NSDL PDF
                    </button>
                  </div>
                </div>

                {ledgerInputMethod === "manual" ? (
                  /* MANUAL ENTRY FORM */
                  <div className="space-y-6 metallic-card p-6">
                    <h2 className="text-sm font-bold uppercase text-zinc-400 tracking-wider">Log Buy Transaction</h2>

                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Asset Class</label>
                        <select
                          value={newAssetType}
                          onChange={(e) => setNewAssetType(e.target.value)}
                          className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                        >
                          <option value="MF">Mutual Fund (India)</option>
                          <option value="STOCK">Equity Stock / ETF</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                          {newAssetType === "MF" ? "MFapi.in Scheme Code" : "Yahoo Finance Symbol"}
                        </label>
                        <input
                          ref={assetInputRef}
                          type="text"
                          placeholder={newAssetType === "MF" ? "e.g. 120503" : "e.g. RELIANCE.NS, AAPL"}
                          value={newAssetCode}
                          onChange={(e) => setNewAssetCode(e.target.value)}
                          className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                        />
                        <span className="text-[10px] text-zinc-500 block mt-1 leading-tight">
                          {newAssetType === "MF" ? (
                            <>Look up numeric fund codes at <a href="https://www.mfapi.in" target="_blank" rel="noreferrer" className="text-lime-400 underline">mfapi.in</a></>
                          ) : (
                            "Include suffix like .NS for NSE stocks (e.g. INFY.NS)"
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Buy Price (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={newAssetBuyPrice || ""}
                            onChange={(e) => setNewAssetBuyPrice(Number(e.target.value))}
                            className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Units</label>
                          <input
                            type="number"
                            step="0.0001"
                            placeholder="0.00"
                            value={newAssetUnits || ""}
                            onChange={(e) => setNewAssetUnits(Number(e.target.value))}
                            className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Purchase Date</label>
                        <input
                          type="date"
                          value={newAssetPurchaseDate}
                          onChange={(e) => setNewAssetPurchaseDate(e.target.value)}
                          className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                        />
                      </div>

                      <button
                        onClick={addAssetTransaction}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 to-lime-600 hover:from-lime-300 hover:to-lime-550 py-3 font-extrabold text-black transition-all active:scale-[0.98] border border-lime-400 shadow-md"
                      >
                        <Plus className="h-4 w-4" /> Save Transaction
                      </button>
                    </div>
                  </div>
                ) : (
                  /* CAMS / NSDL PDF CAS PARSER */
                  <div className="space-y-6 metallic-card p-6">
                    <h2 className="text-sm font-bold uppercase text-zinc-400 tracking-wider">Import CAS Statement</h2>
                    
                    {!casParsedData ? (
                      <div className="space-y-4">
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={handleCasDrop}
                          className="border border-dashed border-zinc-850 hover:border-[#b76e79]/60 rounded-xl p-6 text-center cursor-pointer transition-all bg-black/40 group flex flex-col items-center justify-center relative min-h-32"
                        >
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleCasFileChange}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <Upload className="h-8 w-8 text-zinc-650 group-hover:text-rose-gold mb-2 transition-colors" />
                          <p className="text-xs font-semibold text-zinc-300">
                            {casFile ? casFile.name : "Drag & drop CAS PDF here"}
                          </p>
                          <p className="text-[10px] text-zinc-550 mt-1">CAMS or NSDL e-CAS Consolidated Account Statement</p>
                        </div>

                        {casFile && (
                          <div className="space-y-3 pt-2">
                            <div>
                              <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">CAS Password</label>
                              <input
                                type="password"
                                placeholder="Enter PDF password (PAN / Email)..."
                                value={casPassword}
                                onChange={(e) => setCasPassword(e.target.value)}
                                className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 placeholder-zinc-600 focus:outline-none focus:border-[#b76e79] focus:ring-1 focus:ring-[#b76e79] font-sans text-xs"
                              />
                              <span className="text-[9px] text-zinc-550 block mt-1 leading-tight">Decryption happens entirely locally inside your browser framework.</span>
                            </div>

                            <button
                              onClick={decryptAndParseCas}
                              disabled={isCasDecrypting}
                              className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-gold text-black py-2.5 font-extrabold hover:opacity-90 transition-all text-xs"
                            >
                              {isCasDecrypting ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "Decrypt & Parse CAS Statement"
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* PARSED CHECKLIST VIEW */
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-xs border-b border-zinc-850 pb-2">
                          <span className="font-semibold text-zinc-400">Select Holdings to Import ({selectedCasRows.length})</span>
                          <button
                            onClick={() => {
                              if (selectedCasRows.length === casParsedData.length) {
                                setSelectedCasRows([]);
                              } else {
                                setSelectedCasRows(casParsedData.map(item => item.id));
                              }
                            }}
                            className="text-rose-gold font-semibold hover:underline"
                          >
                            Toggle All
                          </button>
                        </div>

                        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                          {casParsedData.map((item) => (
                            <label
                              key={item.id}
                              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                selectedCasRows.includes(item.id)
                                  ? "bg-zinc-900/60 border-[#b76e79]/30 text-white"
                                  : "bg-black/60 border-zinc-900 text-zinc-450 hover:border-zinc-800"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedCasRows.includes(item.id)}
                                onChange={() => toggleCasRow(item.id)}
                                className="accent-[#b76e79] mt-0.5"
                              />
                              <div className="text-[10px]">
                                <span className="font-bold text-white block truncate max-w-[180px]">{item.name}</span>
                                <span className="font-mono text-zinc-500 block">{item.code} • {item.type}</span>
                                <span className="font-mono text-lime-400 block mt-0.5 font-semibold">
                                  {item.units.toFixed(3)} units @ ₹{item.price.toFixed(2)}
                                </span>
                              </div>
                            </label>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-850">
                          <button
                            onClick={() => {
                              setCasFile(null);
                              setCasParsedData(null);
                              setSelectedCasRows([]);
                            }}
                            className="rounded-xl border border-zinc-800 text-zinc-450 py-2.5 hover:bg-zinc-900 transition-all font-semibold text-xs text-center"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={importCasTransactions}
                            disabled={selectedCasRows.length === 0}
                            className="rounded-xl bg-rose-gold text-black py-2.5 hover:opacity-90 transition-all font-extrabold text-xs text-center flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" /> Import
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MAIN: Holdings & Dynamic P&L ledger table */}
              <div className="col-span-1 flex flex-col space-y-6 md:col-span-2">
                <div className="metallic-card p-6">
                  <div className="flex flex-col gap-4 border-b border-zinc-850 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-200 font-heading">Asset Holdings & Live Returns</h3>
                      <p className="text-xs text-zinc-500 font-sans">Dynamic portfolio analysis, real-time price feeds, cost basis calculations.</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] text-zinc-550 uppercase tracking-wider">Aggregated Worth</p>
                        <p className="text-lg font-extrabold text-lime-400 font-mono">₹{ledgerNetWorth.toLocaleString()}</p>
                      </div>
                      <button
                        onClick={loadResolvedAssets}
                        disabled={isResolving}
                        className="rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 p-2 transition-colors disabled:opacity-50"
                        title="Reload feed prices"
                      >
                        <RefreshCw className={`h-4 w-4 text-lime-450 ${isResolving ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {resolvedAssets.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm mt-4 min-w-[700px]">
                        <thead>
                          <tr className="border-b border-zinc-850 text-[10px] text-zinc-405 uppercase tracking-wider font-bold">
                            <th className="py-3 px-3">Class</th>
                            <th className="py-3 px-3">Identifier</th>
                            <th className="py-3 px-3">Name</th>
                            <th className="py-3 px-3 text-right">Units</th>
                            <th className="py-3 px-3 text-right">Avg. Buy</th>
                            <th className="py-3 px-3 text-right">Live Price</th>
                            <th className="py-3 px-3 text-right">Cost Basis</th>
                            <th className="py-3 px-3 text-right">Valuation</th>
                            <th className="py-3 px-3 text-right">Net P&L</th>
                            <th className="py-3 px-3 text-center">Feed</th>
                            <th className="py-3 px-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850/50">
                          {resolvedAssets.map((asset, index) => {
                            const costBasis = asset.avg_buy_price * asset.units;
                            const isExpanded = expandedAssetCode === asset.code;
                            return (
                              <>
                                <tr key={index} className="hover:bg-zinc-900/10 transition-colors">
                                  <td className="py-3 px-3 font-semibold text-xs text-zinc-350">
                                    <span className={`px-2 py-0.5 rounded text-[10px] ${asset.type === "MF" ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" : "bg-blue-500/10 text-blue-450 border border-blue-500/20"}`}>
                                      {asset.type}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-mono text-xs text-zinc-400">{asset.code}</td>
                                  <td className="py-3 px-3 max-w-[150px] truncate text-zinc-200 font-medium" title={asset.name}>{asset.name}</td>
                                  <td className="py-3 px-3 text-right font-mono text-zinc-300">{asset.units.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                                  <td className="py-3 px-3 text-right font-mono text-zinc-450">₹{asset.avg_buy_price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                                  <td className="py-3 px-3 text-right font-mono text-zinc-300">₹{asset.price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                                  <td className="py-3 px-3 text-right font-mono text-zinc-450">₹{costBasis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                  <td className="py-3 px-3 text-right font-mono text-lime-400 font-bold">₹{asset.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                  <td className="py-3 px-3 text-right font-mono">
                                    <span className={`font-semibold text-xs ${asset.pnl >= 0 ? "text-emerald-400" : "text-red-500"}`}>
                                      {asset.pnl >= 0 ? "+" : ""}₹{asset.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                      <span className="text-[9px] block opacity-80 font-sans mt-0.5 font-normal">
                                        ({asset.pnl_percentage >= 0 ? "+" : ""}{asset.pnl_percentage.toFixed(1)}%)
                                      </span>
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold border ${
                                      asset.status.startsWith("LIVE") ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" :
                                      asset.status.startsWith("CACHED") ? "bg-amber-500/10 text-amber-400 border-amber-500/25" :
                                      "bg-red-500/10 text-red-400 border-red-500/25"
                                    }`}>
                                      {asset.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <div className="flex justify-center items-center gap-1.5">
                                      <button
                                        onClick={() => toggleAssetExpand(asset.code)}
                                        className={`p-1 rounded text-zinc-500 hover:text-rose-gold transition-colors ${isExpanded ? "bg-zinc-800/40 text-rose-gold" : ""}`}
                                        title="View transaction logs"
                                      >
                                        <Plus className={`h-3.5 w-3.5 transform transition-transform ${isExpanded ? "rotate-45" : ""}`} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setLedgerInputMethod("manual");
                                          setNewAssetType(asset.type);
                                          setNewAssetCode(asset.code);
                                          assetInputRef.current?.focus();
                                        }}
                                        className="p-1 text-zinc-500 hover:text-lime-450 transition-colors"
                                        title="Log a new purchase"
                                      >
                                        <CheckCircle className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => deleteAsset(asset.code)}
                                        className="p-1 text-zinc-650 hover:text-red-500 transition-colors"
                                        title="Purge asset holding"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={11} className="bg-zinc-950/60 p-4 border-t border-b border-zinc-850 shadow-inner">
                                      <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                          <h4 className="text-[10px] font-extrabold text-rose-gold uppercase tracking-wider font-heading">Transaction Ledger: {asset.name}</h4>
                                          <span className="text-[9px] text-zinc-500">All metrics adjusted locally</span>
                                        </div>
                                        {loadingTxs ? (
                                          <div className="flex items-center gap-2 py-3 text-[10px] text-zinc-400">
                                            <RefreshCw className="h-3 w-3 animate-spin text-[#b76e79]" /> Resolving ledger database...
                                          </div>
                                        ) : expandedAssetTxs.length > 0 ? (
                                          <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-900 bg-black/40">
                                            <table className="w-full text-left text-[11px] font-sans">
                                              <thead>
                                                <tr className="bg-zinc-950 text-zinc-500 font-semibold border-b border-zinc-900 text-[10px] uppercase">
                                                  <th className="p-2.5">Date</th>
                                                  <th className="p-2.5 text-right">Price Paid</th>
                                                  <th className="p-2.5 text-right">Units</th>
                                                  <th className="p-2.5 text-right">Invested</th>
                                                  <th className="p-2.5 text-center">Action</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-zinc-900">
                                                {expandedAssetTxs.map((tx) => (
                                                  <tr key={tx.id} className="hover:bg-zinc-900/30">
                                                    <td className="p-2.5 text-zinc-400 font-mono">{tx.purchase_date}</td>
                                                    <td className="p-2.5 text-right font-mono text-zinc-500">₹{tx.buy_price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
                                                    <td className="p-2.5 text-right font-mono text-zinc-300">{tx.units.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                                    <td className="p-2.5 text-right font-mono text-lime-450 font-medium">₹{(tx.buy_price * tx.units).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="p-2.5 text-center">
                                                      <button
                                                        onClick={() => deleteTransaction(tx.id, asset.code)}
                                                        className="text-zinc-650 hover:text-red-500 p-1"
                                                        title="Delete transaction log"
                                                      >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                      </button>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <p className="text-[10px] text-zinc-600 italic">No transaction records found in ledger database.</p>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-550 border border-dashed border-zinc-800 rounded-xl mt-4">
                      <Wallet className="mb-4 h-12 w-12 opacity-50 text-lime-400 animate-pulse" />
                      <p className="text-sm font-semibold">Ledger holds no assets.</p>
                      <p className="text-xs text-zinc-650 mt-1">Select an input mode on the sidebar to add stocks or mutual funds.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 3: Cashflow Tracker */}
          {activeTab === "cashflow" && (
            <>
              {/* SIDEBAR: Log Cashflow Form */}
              <div className="space-y-6 metallic-card p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-200">
                  <Activity className="h-5 w-5 text-lime-400" /> Log Transaction
                </h2>

                <div className="space-y-4">
                  <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                    <button
                      onClick={() => setNewCfFlowType("EXPENSE")}
                      className={`flex-1 text-center py-1 text-xs font-semibold rounded-md transition-all ${
                        newCfFlowType === "EXPENSE" ? "bg-red-950/20 text-red-400 border border-red-900/30" : "text-zinc-500 hover:text-zinc-350"
                      }`}
                    >
                      Expense
                    </button>
                    <button
                      onClick={() => setNewCfFlowType("INCOME")}
                      className={`flex-1 text-center py-1 text-xs font-semibold rounded-md transition-all ${
                        newCfFlowType === "INCOME" ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" : "text-zinc-500 hover:text-zinc-350"
                      }`}
                    >
                      Income
                    </button>
                    <button
                      onClick={() => setNewCfFlowType("INVESTMENT")}
                      className={`flex-1 text-center py-1 text-xs font-semibold rounded-md transition-all ${
                        newCfFlowType === "INVESTMENT" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "text-zinc-500 hover:text-zinc-350"
                      }`}
                    >
                      Invest
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Category</label>
                    <input
                      ref={cashflowInputRef}
                      type="text"
                      placeholder="e.g. Salary, Rent, Dining Out, Stocks"
                      value={newCfCategory}
                      onChange={(e) => setNewCfCategory(e.target.value)}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 placeholder-zinc-550 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newCfAmount || ""}
                      onChange={(e) => setNewCfAmount(Number(e.target.value))}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Date</label>
                    <input
                      type="date"
                      value={newCfDate}
                      onChange={(e) => setNewCfDate(e.target.value)}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400 font-semibold uppercase tracking-wider">Description / Notes</label>
                    <textarea
                      placeholder="Optional notes..."
                      value={newCfDescription}
                      onChange={(e) => setNewCfDescription(e.target.value)}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm h-20"
                    />
                  </div>

                  <button
                    onClick={addCashflow}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-lime-400 to-lime-600 hover:from-lime-300 hover:to-lime-500 py-3 font-extrabold text-black transition-all active:scale-[0.98] border border-lime-400"
                  >
                    <Plus className="h-4 w-4" /> Save Entry
                  </button>
                </div>
              </div>

              {/* MAIN: Cashflow ledger table */}
              <div className="col-span-1 flex flex-col space-y-6 md:col-span-2">
                <div className="metallic-card p-6">
                  <h3 className="mb-4 text-lg font-semibold text-zinc-200 font-heading">Zero-Based Cashflow Ledger</h3>

                  {cashflows.length > 0 ? (
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto pr-1">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-850 text-xs text-zinc-400 uppercase tracking-wider sticky top-0 bg-black z-10 font-semibold">
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Flow Type</th>
                            <th className="py-3 px-4">Category</th>
                            <th className="py-3 px-4">Description</th>
                            <th className="py-3 px-4 text-right">Amount</th>
                            <th className="py-3 px-4 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850/60 text-zinc-300">
                          {cashflows.map((cf) => (
                            <tr key={cf.id} className="hover:bg-zinc-900/20 transition-colors">
                              <td className="py-3 px-4 text-zinc-450 font-mono text-xs">{cf.date}</td>
                              <td className="py-3 px-4">
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-0.5 border ${
                                  cf.flow_type === "INCOME" ? "bg-emerald-500/10 text-emerald-450 border-emerald-500/30" :
                                  cf.flow_type === "INVESTMENT" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                                  "bg-red-500/10 text-red-500 border-red-500/30"
                                }`}>
                                  {cf.flow_type === "INCOME" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                  {cf.flow_type}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-white font-semibold">{cf.category}</td>
                              <td className="py-3 px-4 text-zinc-400 max-w-xs truncate text-xs" title={cf.description || ""}>
                                {cf.description || <span className="text-zinc-650 italic">No notes</span>}
                              </td>
                              <td className={`py-3 px-4 text-right font-mono font-bold ${
                                cf.flow_type === "INCOME" ? "text-emerald-400" :
                                cf.flow_type === "INVESTMENT" ? "text-blue-400" :
                                "text-red-500"
                              }`}>
                                ₹{cf.amount.toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => deleteCashflow(cf.id)}
                                  className="text-zinc-500 hover:text-red-500 p-1 transition-colors"
                                  title="Delete Transaction"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-550 border border-dashed border-zinc-800 rounded-xl mt-4">
                      <Activity className="mb-4 h-12 w-12 opacity-50 text-lime-400" />
                      <p className="text-sm font-semibold">No transactions recorded.</p>
                      <p className="text-xs text-zinc-650 mt-1">Use the panel on the left to document your income, investments, and burn rate.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 4: Analytics */}
          {activeTab === "analytics" && (
            <>
              {/* SIDEBAR: Spend filter & Advanced AI strategist */}
              <div className="space-y-6">
                
                {/* Year Filter Card */}
                <div className="metallic-card p-6 space-y-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-200">
                    <BarChart3 className="h-5 w-5 text-lime-400" /> Spend Filter
                  </h2>
                  
                  <div>
                    <label className="mb-1 block text-xs text-zinc-450 uppercase font-semibold">Select Analysis Year</label>
                    <select
                      value={displayYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full rounded-xl bg-black px-3 py-2 text-white border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-lime-500 font-sans text-sm"
                    >
                      {availableYears.length > 0 ? (
                        availableYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))
                      ) : (
                        <option value={new Date().getFullYear().toString()}>
                          {new Date().getFullYear().toString()}
                        </option>
                      )}
                    </select>
                  </div>

                  <div className="rounded-xl bg-black p-4 border border-zinc-850 shadow-inner">
                    <p className="text-xs text-zinc-450 font-semibold uppercase tracking-wider">Total Expenses ({displayYear})</p>
                    <p className="text-xl font-bold text-red-500 mt-1 font-mono">₹{totalYearlyExpense.toLocaleString()}</p>
                  </div>

                  {/* Yearly Category Spending List */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-semibold text-rose-gold uppercase tracking-wider font-heading">Breakdown by Category</h4>
                    
                    {yearlyCategoryList.length > 0 ? (
                      <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                        {yearlyCategoryList.map((item, index) => (
                          <div key={index} className="text-xs">
                            <div className="flex justify-between mb-1 text-zinc-350">
                              <span className="font-semibold text-white">{item.name}</span>
                              <span className="font-mono text-zinc-400">
                                ₹{item.value.toLocaleString()} ({item.percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="w-full bg-black h-1.5 rounded-full overflow-hidden border border-zinc-800">
                              <div
                                className="bg-[#b76e79] h-full rounded-full transition-all"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-650 italic">No expenses recorded for this year.</p>
                    )}
                  </div>
                </div>

                {/* LOCAL IDENTITY & PAN CARD */}
                <div className="metallic-card p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5 font-heading">
                      <User className="h-4 w-4 text-rose-gold" /> Local Identity (PAN)
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">Used to automatically decrypt CAMS / NSDL e-CAS Consolidated Account Statement PDFs locally.</p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-zinc-450 block font-semibold uppercase">PAN Holder Name</label>
                      <input
                        type="text"
                        placeholder="Enter full name..."
                        value={panName}
                        onChange={(e) => setPanName(e.target.value)}
                        className="w-full rounded-lg bg-black px-3 py-1.5 text-white border border-zinc-800 text-xs focus:outline-none focus:border-[#b76e79] focus:ring-1 focus:ring-[#b76e79]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-450 block font-semibold uppercase">PAN Number</label>
                      <input
                        type="text"
                        placeholder="e.g. ABCDE1234F"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                        className="w-full rounded-lg bg-black px-3 py-1.5 text-white border border-zinc-800 text-xs font-mono focus:outline-none focus:border-[#b76e79] focus:ring-1 focus:ring-[#b76e79]"
                      />
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      await saveUserSettings(undefined, undefined, undefined, undefined, undefined, panNumber, panName);
                      alert("Identity saved successfully.");
                    }}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 font-semibold text-xs py-2 transition-all"
                  >
                    Save Identity
                  </button>
                </div>

                {/* ADVANCED AI TOOL CARD */}
                <div className="metallic-card-gold p-6 space-y-4 border border-[#b76e79]/35">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-[#e5c2c0] uppercase tracking-wider flex items-center gap-1.5 font-heading">
                      <Brain className="h-4 w-4 text-[#b76e79]" /> Advanced: AI Strategy
                    </h3>
                    <span className="text-[8px] bg-[#b76e79]/15 border border-[#b76e79]/20 text-[#e5c2c0] px-2 py-0.5 rounded font-extrabold uppercase">Advanced</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">Run a continuous calculus analysis of your active ledger and horizon timeline with your personalized Gemini API Key.</p>

                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-450 block font-semibold">Gemini API Key:</label>
                    <input
                      type="password"
                      placeholder="Paste Gemini API Key..."
                      value={dashGeminiApiKey}
                      onChange={(e) => setDashGeminiApiKey(e.target.value)}
                      className="w-full rounded-lg bg-black px-3 py-1.5 text-white border border-zinc-800 text-xs font-mono focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
                    />
                  </div>

                  <button
                    onClick={runDashboardAiAnalysis}
                    disabled={dashAiLoading || !dashGeminiApiKey.trim()}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-rose-gold text-black font-extrabold hover:opacity-90 text-xs py-2.5 transition-all shadow-lg shadow-[#b76e79]/25 active:scale-[0.98]"
                  >
                    <Brain className="h-3.5 w-3.5" />
                    {dashAiLoading ? "Simulating AI Strategy..." : "Query Advanced AI"}
                  </button>

                  {dashAiAnalysis && (
                    <div className="mt-3 bg-black p-3 rounded-lg border border-zinc-900 text-[10px] text-zinc-305 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border-chrome-silver-gradient">
                      {dashAiAnalysis}
                    </div>
                  )}
                </div>

              </div>

              {/* MAIN: Budgets and Spending Visualizer */}
              <div className="col-span-1 flex flex-col space-y-6 md:col-span-2">
                
                {/* Monthly Budget Analyser */}
                <div className="metallic-card p-6">
                  <h3 className="mb-2 text-lg font-semibold text-zinc-200 font-heading">Monthly Budget Analyser</h3>
                  <p className="text-xs text-zinc-500 mb-6">Income vs. Expense vs. Investment tracking per calendar month.</p>

                  {sortedMonthlyBudgetData.length > 0 ? (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sortedMonthlyBudgetData}>
                          <XAxis dataKey="month" stroke="#71717a" />
                          <YAxis stroke="#71717a" tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#050505", borderColor: "rgba(255,255,255,0.08)", borderRadius: "8px", color: "#ffffff" }}
                            formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, ""]}
                          />
                          <Legend />
                          {/* Neon Green for Income, Dull Red for Expense, Royal Blue for Investment */}
                          <Bar dataKey="income" fill="#22c55e" name="Income (Neon Green)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="expense" fill="#991b1b" name="Expense (Dull Red)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="investment" fill="#2563eb" name="Investment (Royal Blue)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-550 border border-dashed border-zinc-800 rounded-xl">
                      <Activity className="h-10 w-10 opacity-30 mb-2 text-lime-450" />
                      <p className="text-sm font-semibold">No monthly data available.</p>
                      <p className="text-xs text-zinc-650 mt-1">Please insert transactions under the Cashflow tab.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      <footer className="mt-8 border-t border-zinc-900 pt-4 text-center text-xs text-zinc-600 relative z-10 flex flex-col sm:flex-row justify-between items-center gap-2">
        <p>FinancialsOS is a proprietary, local-first continuous calculus horizonal engine.</p>
        <p className="text-[10px] text-zinc-650">relational ledger: sqlite3 | color accents: rose-gold & chrome-silver | theme: yellowish-green</p>
      </footer>
    </div>
  );
}

export default App;