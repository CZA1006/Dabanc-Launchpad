/**
 * Dabanc Launchpad - Ultimate v10.0 (Price Chart + Auction Order Book)
 * 1. Modern glass morphism UI 🔮
 * 2. Price Curve Chart 📈
 * 3. Auction-style Order Book (5 levels above/below clearing) 📊
 * 4. All original functionality preserved ✅
 */

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { 
  useAccount, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt, 
  useBalance
} from 'wagmi';
import { useState, useEffect, useMemo, useRef } from 'react';
import { parseEther, formatEther } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { format } from 'date-fns';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Clock, 
  Flame,
  Wallet,
  ArrowDownUp,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { 
  AUCTION_ADDRESS, 
  USDC_ADDRESS, 
  TOKEN_ADDRESS,
  AUCTION_ABI, 
  USDC_ABI, 
  PROJECT_CONFIG,
  formatters,
  getFriendlyError,
  API_URL 
} from './constants';

interface Bid {
  user: string;
  amount: number;
  limitPrice: number;
  timestamp: number;
}

interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
  roundId: number;
}

type ChartViewMode = 'all' | 'current' | number; // 'all' = all rounds, 'current' = current round, number = specific past round

// 🔧 Config: Limits kept high for testing
const MAX_SINGLE_ORDER_PERCENT = 5.0; 
const MAX_PER_USER_PERCENT = 100.0; 

export default function App() {
  const { address, isConnected } = useAccount();
  console.log("🚀 App Rendering, isConnected:", isConnected, "Address:", address);
  console.log("🌐 ACTIVE_NETWORK:", PROJECT_CONFIG.network, "AUCTION_ADDRESS:", AUCTION_ADDRESS);
  
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [selectedAsset, setSelectedAsset] = useState<'USDC' | 'wSPX'>('USDC');
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [realBids, setRealBids] = useState<Bid[]>([]); 
  const [txError, setTxError] = useState<string | null>(null);
  const [, setStep] = useState<string>('idle');
  
  // 🌟 Price History for Chart
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('current');
  
  // 🌟 Settlement State
  const [showResult, setShowResult] = useState(false);
  const [lastAllocated, setLastAllocated] = useState({ amount: 0, price: 0, roundId: 0 });
  
  const prevTokenBalance = useRef<bigint>(0n);
  const prevRoundId = useRef<number>(0);
  const lastPriceRef = useRef<number>(10.0);

  const { writeContract, data: hash, isPending, reset, error: writeError } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  useBalance({ address });

  // === Contract Reads ===
  const { data: isRoundActive } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'isRoundActive', query: { refetchInterval: 2000 }
  });
  const { data: currentRoundId } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'currentRoundId', query: { refetchInterval: 2000 }
  });
  const { data: lastClearingTime } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'lastClearingTime', query: { refetchInterval: 2000 }
  });

  // === Wallet Balances (MetaMask) ===
  const { data: walletUsdc, refetch: refetchWalletUsdc } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, query: { refetchInterval: 3000 }
  });
  const { data: walletToken, refetch: refetchWalletToken } = useReadContract({
    address: TOKEN_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, query: { refetchInterval: 3000 }
  });

  // === Protocol Balances (Deposited) ===
  const { data: contractUsdcBalance, refetch: refetchContractUsdc } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'userBalances', args: address ? [address] : undefined, query: { refetchInterval: 2000 }
  });
  const { data: contractTokenBalance, refetch: refetchContractToken } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'userTokenBalances', args: address ? [address] : undefined, query: { refetchInterval: 2000 }
  });

  // === Allowances ===
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'allowance', args: address ? [address, AUCTION_ADDRESS] : undefined, query: { refetchInterval: 3000 }
  });
  const { data: tokenAllowance, refetch: refetchTokenAllowance } = useReadContract({
    address: TOKEN_ADDRESS, abi: USDC_ABI, functionName: 'allowance', args: address ? [address, AUCTION_ADDRESS] : undefined, query: { refetchInterval: 3000 }
  });

  const { data: isWhitelisted } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'isWhitelisted', args: address ? [address] : undefined,
  });

  const isSettling = useMemo(() => {
    // 只有当明确读到 isRoundActive 为 false，且倒计时确实为 0 时才显示结算中
    // 这样加载中 (undefined) 的时候就不会显示遮罩层
    return isRoundActive === false && timeLeft <= 0;
  }, [isRoundActive, timeLeft]);

  // === Effects ===
  useEffect(() => {
    if (contractTokenBalance !== undefined) {
      if (contractTokenBalance > prevTokenBalance.current && prevRoundId.current > 0) {
        const diff = Number(formatEther(contractTokenBalance - prevTokenBalance.current));
        setLastAllocated({ 
          amount: diff, 
          price: clearingPrice,
          roundId: prevRoundId.current 
        });
        setShowResult(true);
      }
      prevTokenBalance.current = contractTokenBalance;
    }
  }, [contractTokenBalance]);

  useEffect(() => {
    if (currentRoundId && prevRoundId.current !== Number(currentRoundId)) {
      // 轮次变化时，清空旧数据
      console.log(`🔄 Round changed from ${prevRoundId.current} to ${Number(currentRoundId)}, clearing old data`);
      setRealBids([]);
      setPriceHistory(prev => prev.filter(p => p.roundId !== prevRoundId.current));
      prevRoundId.current = Number(currentRoundId);
    }
  }, [currentRoundId]);

  useEffect(() => {
    if (!currentRoundId) return;
    console.log("🔍 Fetching order book for Round:", Number(currentRoundId));
    const fetchOrderBook = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/orders?roundId=${currentRoundId}`);
        console.log(`📊 Received ${res.data?.length || 0} orders from API`);
        if (res.data && Array.isArray(res.data)) setRealBids(res.data);
      } catch (e) {
        console.error("❌ Failed to fetch order book:", e);
      }
    };
    fetchOrderBook(); 
    const interval = setInterval(fetchOrderBook, 2000); 
    return () => clearInterval(interval);
  }, [currentRoundId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (isRoundActive && lastClearingTime) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - Number(lastClearingTime);
        const remaining = PROJECT_CONFIG.roundDuration - elapsed;
        setTimeLeft(remaining > 0 ? remaining : 0);
      } else { setTimeLeft(0); }
    }, 1000);
    return () => clearInterval(timer);
  }, [isRoundActive, lastClearingTime]);

  useEffect(() => {
    if (isConfirmed) {
      refetchWalletUsdc(); refetchWalletToken();
      refetchAllowance(); refetchTokenAllowance();
      refetchContractUsdc(); refetchContractToken();
      reset(); setStep('idle'); setTxError(null);
    }
  }, [isConfirmed]);

  useEffect(() => {
    if (writeError) { setTxError(getFriendlyError(writeError)); setStep('idle'); }
  }, [writeError]);

  // === Matching Logic ===
  const { clearingPrice, orderBookRows, stats, totalDemand, userCurrentOrders } = useMemo(() => {
    const SUPPLY = PROJECT_CONFIG.supplyPerRound;
    if (realBids.length === 0) return { clearingPrice: 10.0, orderBookRows: [], stats: { high: 0, low: 0, volume: 0 }, totalDemand: 0, userCurrentOrders: 0 };
    
    const sorted = [...realBids].sort((a, b) => b.limitPrice - a.limitPrice || a.timestamp - b.timestamp);
    let accumulated = 0;
    let price = 10.0;
    let totalVol = 0;
    let userOrders = 0;

    for (let i = 0; i < sorted.length; i++) {
      const bid = sorted[i];
      if (!bid || bid.limitPrice === null || bid.limitPrice === undefined || bid.limitPrice === 0) continue;
      
      const tokens = bid.amount / bid.limitPrice;
      accumulated += tokens;
      totalVol += bid.amount;
      if (address && bid.user.toLowerCase() === address.toLowerCase()) userOrders += tokens;
      if (accumulated >= SUPPLY && price === 10.0) { price = bid.limitPrice; }
    }
    if (accumulated < SUPPLY && sorted.length > 0) price = sorted[sorted.length - 1].limitPrice;
    price = Math.max(0.01, price);

    // 用2位小数精度进行价格分组整合
    const priceGroups: Record<string, { tokens: number; usdc: number }> = {};
    sorted.forEach(bid => {
      if (!bid || bid.limitPrice === null || bid.limitPrice === undefined) return;
      
      // 使用2位小数精度进行分组
      const priceKey = Number(bid.limitPrice).toFixed(2);
      if (!priceGroups[priceKey]) priceGroups[priceKey] = { tokens: 0, usdc: 0 };
      
      const safePrice = bid.limitPrice > 0 ? bid.limitPrice : 0.0001;
      priceGroups[priceKey].tokens += bid.amount / safePrice;
      priceGroups[priceKey].usdc += bid.amount;
    });

    const rows = Object.entries(priceGroups)
      .map(([priceStr, data]) => ({
        price: parseFloat(priceStr),
        tokens: data.tokens,
        usdc: data.usdc,
        isAboveClearing: parseFloat(priceStr) >= price
      }))
      .sort((a, b) => b.price - a.price);

    const maxTokens = Math.max(...rows.map(r => r.tokens), 1);
    rows.forEach(r => { (r as any).percent = (r.tokens / maxTokens) * 100; });
    const prices = sorted.map(b => b.limitPrice).filter(p => p !== null && p !== undefined);

    return { 
      clearingPrice: price, 
      orderBookRows: rows, 
      stats: { 
        high: prices.length ? Math.max(...prices) : price, 
        low: prices.length ? Math.min(...prices) : price, 
        volume: totalVol 
      }, 
      totalDemand: accumulated, 
      userCurrentOrders: userOrders 
    };
  }, [realBids, address]);

  // 📈 Update price history when clearing price changes
  useEffect(() => {
    if (clearingPrice && currentRoundId) {
      const roundNum = Number(currentRoundId);
      const shouldUpdate = clearingPrice !== lastPriceRef.current ||
                          !priceHistory.some(p => p.roundId === roundNum);

      if (shouldUpdate) {
        lastPriceRef.current = clearingPrice;
        setPriceHistory(prev => {
          const newPoint: PricePoint = {
            timestamp: Date.now(),
            price: clearingPrice,
            volume: stats.volume,
            roundId: roundNum
          };
          const updated = [...prev, newPoint];
          // Keep last 500 points (to store multiple rounds)
          return updated.slice(-500);
        });
      }
    }
  }, [clearingPrice, stats.volume, currentRoundId, priceHistory]);

  // 📊 Get available rounds from price history
  const availableRounds = useMemo(() => {
    const rounds = [...new Set(priceHistory.map(p => p.roundId))].sort((a, b) => b - a);
    return rounds;
  }, [priceHistory]);

  // 📊 Filter chart data based on view mode
  const filteredPriceHistory = useMemo(() => {
    const currentRound = currentRoundId ? Number(currentRoundId) : 0;
    
    if (chartViewMode === 'all') {
      return priceHistory;
    } else if (chartViewMode === 'current') {
      return priceHistory.filter(p => p.roundId === currentRound);
    } else {
      // Specific past round
      return priceHistory.filter(p => p.roundId === chartViewMode);
    }
  }, [priceHistory, chartViewMode, currentRoundId]);

  // 📊 Generate 5 levels above and below clearing price (基于2位小数精度整合后的数据)
  // 注意：清算价格是基于完整订单簿计算的，这里只是显示最接近的5档
  const auctionOrderBook = useMemo(() => {
    // 清算价格取整到2位小数
    const clearingPrice2d = Math.round(clearingPrice * 100) / 100;
    
    // 获取高于清算价格的订单（按价格从低到高排序，取最接近的5档）
    const aboveClearing = orderBookRows
      .filter(r => r.price > clearingPrice2d)
      .sort((a, b) => a.price - b.price) // 升序，最接近清算价格的在前
      .slice(0, 5)
      .reverse(); // 反转，最高的在上面

    // 清算价格档位
    const atClearing = orderBookRows.filter(r => Math.abs(r.price - clearingPrice2d) < 0.005);

    // 获取低于清算价格的订单（按价格从高到低排序，取最接近的5档）
    const belowClearing = orderBookRows
      .filter(r => r.price < clearingPrice2d)
      .sort((a, b) => b.price - a.price) // 降序，最接近清算价格的在前
      .slice(0, 5);

    // Calculate cumulative amounts
    let cumulativeAbove = 0;
    const aboveWithCumulative = aboveClearing.map(row => {
      cumulativeAbove += row.tokens;
      return { ...row, cumulative: cumulativeAbove };
    });

    let cumulativeBelow = 0;
    const belowWithCumulative = belowClearing.map(row => {
      cumulativeBelow += row.tokens;
      return { ...row, cumulative: cumulativeBelow };
    });

    const maxCumulative = Math.max(
      ...aboveWithCumulative.map(r => r.cumulative),
      ...belowWithCumulative.map(r => r.cumulative),
      1
    );

    return {
      above: aboveWithCumulative.map(r => ({ ...r, percent: (r.cumulative / maxCumulative) * 100 })),
      at: atClearing,
      below: belowWithCumulative.map(r => ({ ...r, percent: (r.cumulative / maxCumulative) * 100 })),
    };
  }, [orderBookRows, clearingPrice]);

  const { totalCost, orderWarning, maxSingleOrder } = useMemo(() => {
    const SUPPLY = PROJECT_CONFIG.supplyPerRound;
    const requestedTokens = parseFloat(amount) || 0;
    const price = orderType === 'market' ? clearingPrice : (parseFloat(limitPrice) || clearingPrice);
    const cost = requestedTokens * price;
    
    const maxSingle = SUPPLY * MAX_SINGLE_ORDER_PERCENT;
    const maxUserTotal = SUPPLY * MAX_PER_USER_PERCENT;
    const userRemaining = Math.max(0, maxUserTotal - userCurrentOrders);
    const effectiveMax = Math.min(maxSingle, userRemaining);
    
    let warning = null;
    
    if (requestedTokens > maxSingle) {
      warning = `Max per order: ${formatters.amount(maxSingle)} wSPX`;
    } else if (requestedTokens > userRemaining && userRemaining < maxSingle) {
      warning = `Remaining quota: ${formatters.amount(userRemaining)} wSPX`;
    }
    
    return { totalCost: cost, orderWarning: warning, maxSingleOrder: effectiveMax };
  }, [amount, limitPrice, orderType, clearingPrice, userCurrentOrders, totalDemand]);

  const needsApproval = useMemo(() => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return false;
    
    if (selectedAsset === 'USDC') {
      if (!usdcAllowance) return true;
      return Number(formatEther(usdcAllowance)) < parseFloat(depositAmount);
    } else {
      if (!tokenAllowance) return true;
      return Number(formatEther(tokenAllowance)) < parseFloat(depositAmount);
    }
  }, [usdcAllowance, tokenAllowance, depositAmount, selectedAsset]);

  const handleDeposit = () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0 || isSettling) return;
    setTxError(null);

    if (selectedAsset === 'USDC') {
      if (needsApproval) {
        setStep('approving');
        writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [AUCTION_ADDRESS, parseEther(depositAmount)] });
      } else {
        setStep('depositing');
        writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'deposit', args: [parseEther(depositAmount)] });
      }
    }
  };

  const handleWithdraw = () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0 || isSettling) return;
    setTxError(null); setStep('withdrawing');
    if (selectedAsset === 'USDC') {
      writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'withdraw', args: [parseEther(depositAmount)] });
    } else {
      writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'withdrawTokens', args: [parseEther(depositAmount)] });
    }
  };

  const handleMint = () => {
    writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'mint', args: [address!, parseEther('1000000')] });
  };

  const handlePlaceOrder = async () => {
    if (!address || !currentRoundId || isSettling) return;
    setTxError(null); 
    setStep('bidding');
    
    const orderAmount = parseFloat(amount);
    if (!orderAmount || orderAmount <= 0) {
      setTxError("Please enter a valid amount");
      setStep('idle');
      return;
    }

    const price = orderType === 'market' ? clearingPrice : parseFloat(limitPrice);
    const cost = orderAmount * price;
    const balance = contractUsdcBalance ? parseFloat(formatEther(contractUsdcBalance)) : 0;
    
    if (balance < cost) {
      setTxError(`Insufficient Balance! Need ${formatters.amount(cost)} USDC`);
      setStep('idle'); return;
    }

    try {
      await axios.post(`${API_URL}/api/bid`, {
        roundId: Number(currentRoundId),
        userAddress: address,
        amount: cost.toString(),
        limitPrice: price.toString()
      });
      setAmount(''); setStep('idle');
    } catch (e: any) {
      setTxError(e.response?.data?.error || e.message);
      setStep('idle');
    }
  };

  const setAmountPercent = (percent: number) => {
    const balance = contractUsdcBalance ? parseFloat(formatEther(contractUsdcBalance)) : 0;
    const price = orderType === 'market' ? clearingPrice : (parseFloat(limitPrice) || clearingPrice);
    
    if (price > 0 && balance > 0) {
      const maxByBalance = (balance / price);
      const targetAmount = maxByBalance * (percent / 100);
      setAmount(targetAmount.toFixed(2));
    }
  };

  const fmt = (val: bigint | undefined) => val ? formatters.amount(Number(formatEther(val))) : '0.00';
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isUrgent = timeLeft < 60;
  const progressPercent = ((PROJECT_CONFIG.roundDuration - timeLeft) / PROJECT_CONFIG.roundDuration) * 100;

  // Chart data - use filtered data based on view mode
  const chartData = filteredPriceHistory.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), "HH:mm:ss"),
    fullTime: format(new Date(point.timestamp), "MM/dd HH:mm:ss"),
  }));

  const minPrice = chartData.length > 0 ? Math.min(...chartData.map(d => d.price)) * 0.995 : clearingPrice * 0.9;
  const maxPrice = chartData.length > 0 ? Math.max(...chartData.map(d => d.price)) * 1.005 : clearingPrice * 1.1;

  // Custom tooltip for chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card p-3 text-sm">
          <p className="text-surface-400 text-xs">{payload[0].payload.fullTime}</p>
          <p className="font-mono font-semibold text-accent-green">
            ${payload[0].value.toFixed(4)}
          </p>
          <p className="text-surface-500 text-xs">
            Round #{payload[0].payload.roundId}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen">
      {/* 🚀 Settlement Popup Overlay */}
      <AnimatePresence>
        {isSettling && !showResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overlay"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="modal-card text-center animate-glow"
            >
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center text-4xl shadow-xl shadow-primary-500/30">
                ⚡️
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 uppercase tracking-wide">Settlement in Progress</h2>
              <p className="text-primary-400 font-mono text-sm mb-8">Executing smart contract clearing logic...</p>
              <div className="spinner mx-auto"></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🌟 Result Modal */}
      <AnimatePresence>
        {showResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="overlay"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="modal-card border-accent-green/30"
            >
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-accent-green/20 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-accent-green" />
                </div>
                <h2 className="text-2xl font-bold text-accent-green mb-2">Settlement Complete</h2>
                <p className="text-surface-400 text-sm">Results for Round #{lastAllocated.roundId}</p>
                
                <div className="my-8 space-y-4">
                  <div>
                    <div className="stat-label">You Received</div>
                    <div className="text-3xl font-mono font-bold text-white">{lastAllocated.amount.toFixed(2)} wSPX</div>
                  </div>
                  <div>
                    <div className="stat-label">Avg. Price</div>
                    <div className="text-3xl font-mono font-bold text-accent-green">${lastAllocated.price.toFixed(4)}</div>
                  </div>
                </div>
                
                <button 
                  onClick={() => setShowResult(false)}
                  className="btn-success w-full py-4 text-lg"
                >
                  Awesome!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xl font-bold shadow-lg shadow-primary-500/30">
                D
              </div>
              <div>
                <h1 className="font-display font-bold text-lg">Dabanc</h1>
                <p className="text-xs text-surface-400">Next-Gen RWA Launchpad</p>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="hidden md:flex items-center gap-4"
            >
              <div className="glass-button px-4 py-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-xs font-bold">
                    W
                  </div>
                  <span className="font-semibold">wSPX</span>
                </div>
                <span className="text-surface-500">/</span>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-xs font-bold">
                    $
                  </div>
                  <span className="font-semibold">USDC</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isRoundActive ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
                <span className="text-surface-400">
                  {isRoundActive ? 'Live' : 'Settling'}
                </span>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <ConnectButton />
            </motion.div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Market Info & Countdown */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Market Info */}
          <div className="lg:col-span-2 glass-card p-6 flex flex-col h-full justify-center">
            <div className="flex flex-wrap items-center justify-center gap-8">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-baseline gap-3">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={clearingPrice}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="text-4xl font-display font-bold tabular-nums text-accent-green"
                    >
                      ${formatters.price(clearingPrice)}
                    </motion.span>
                  </AnimatePresence>
                  <span className="flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-lg bg-accent-green/20 text-accent-green">
                    <TrendingUp size={14} />
                    Est. Price
                  </span>
                </div>
                <p className="text-surface-400 text-sm mt-1">wSPX / USDC</p>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="text-center">
                  <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
                    <TrendingUp size={12} />
                    24h High
                  </div>
                  <p className="font-mono font-semibold text-accent-green">
                    ${formatters.price(stats.high || clearingPrice)}
                  </p>
                </div>

                <div className="text-center">
                  <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
                    <TrendingDown size={12} />
                    24h Low
                  </div>
                  <p className="font-mono font-semibold text-accent-red">
                    ${formatters.price(stats.low || clearingPrice)}
                  </p>
                </div>

                <div className="text-center">
                  <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
                    <BarChart3 size={12} />
                    Volume
          </div>
                  <p className="font-mono font-semibold text-accent-blue">
                    ${formatters.amount(stats.volume)}
                  </p>
        </div>

                <div className="text-center">
                  <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
                    <Activity size={12} />
                    Round
            </div>
                  <p className="font-semibold text-white">
                    #{currentRoundId?.toString() || '1'}
                  </p>
          </div>
        </div>
            </div>
          </div>

          {/* Auction Countdown */}
          <div className={`glass-card p-6 relative overflow-hidden ${isUrgent ? 'border-accent-red/50' : ''}`}>
            <div 
              className={`absolute inset-0 opacity-10 ${isUrgent ? 'bg-accent-red' : 'bg-primary-500'}`}
              style={{ clipPath: `inset(0 ${100 - progressPercent}% 0 0)` }}
            />
          
            <div className="flex items-center justify-between mb-4 relative">
              <div className="flex items-center gap-2">
                {isUrgent ? (
                  <Flame className="text-accent-red animate-pulse" size={20} />
                ) : (
                  <Clock className="text-primary-400" size={20} />
                )}
                <h3 className="font-semibold">Round Ends In</h3>
            </div>
              <div className={`badge ${isUrgent ? 'badge-danger' : 'badge-info'}`}>
                {isUrgent ? '🔥 Ending Soon!' : '⏳ Active'}
            </div>
            </div>

            <div className="flex items-center justify-center gap-2 relative">
              <motion.div 
                key={`time-${timeLeft}`}
                initial={{ scale: 1.1, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <div className={`text-5xl font-display font-bold tabular-nums ${isUrgent ? 'text-accent-red' : 'text-white'}`}>
                  {formatTime(timeLeft)}
                </div>
              </motion.div>
          </div>
          
            <div className="mt-4 relative">
              <div className="progress-bar">
                <motion.div
                  className={`progress-fill ${isUrgent ? 'bg-gradient-to-r from-accent-red to-orange-500' : 'bg-gradient-to-r from-primary-600 to-primary-400'}`}
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5 }}
                />
            </div>
          </div>
        </div>
        </motion.div>

        {isConnected ? (
          <>
            {/* Main Trading Interface - Price Chart + Order Book */}
            <div className={`grid grid-cols-1 xl:grid-cols-12 gap-6 transition-all duration-500 ${isSettling ? 'blur-sm pointer-events-none' : ''}`}>
              {/* 📈 Price Chart */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="xl:col-span-8 glass-card"
              >
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="text-primary-400">📈</span> Clearing Price Chart
                  </h2>
                  <div className="text-sm text-surface-500">
                    {chartData.length} data points
                  </div>
                </div>
                {/* Chart View Mode Selector */}
                <div className="px-4 py-2 border-b border-surface-800/50 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-surface-500 font-semibold">View:</span>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setChartViewMode('current')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        chartViewMode === 'current'
                          ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                          : 'text-surface-400 hover:text-white hover:bg-surface-800 border border-transparent'
                      }`}
                    >
                      Current Round
                    </button>
                    <button
                      onClick={() => setChartViewMode('all')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        chartViewMode === 'all'
                          ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                          : 'text-surface-400 hover:text-white hover:bg-surface-800 border border-transparent'
                      }`}
                    >
                      All Rounds
                    </button>
                    {availableRounds.length > 0 && (
                      <select
                        value={typeof chartViewMode === 'number' ? chartViewMode : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            setChartViewMode(Number(val));
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all bg-surface-900 border cursor-pointer ${
                          typeof chartViewMode === 'number'
                            ? 'border-primary-500/50 text-primary-400'
                            : 'border-surface-700 text-surface-400 hover:border-surface-600'
                        }`}
                      >
                        <option value="" disabled>Past Rounds...</option>
                        {availableRounds.map(roundId => (
                          <option key={roundId} value={roundId}>
                            Round #{roundId}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {chartViewMode !== 'current' && (
                    <span className="text-xs text-accent-yellow">
                      {chartViewMode === 'all' 
                        ? `Showing ${availableRounds.length} rounds` 
                        : `Historical data for Round #${chartViewMode}`}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <div className="h-[400px] pt-20">
                    {chartData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="150%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                              <stop offset="50%" stopColor="#22c55e" stopOpacity={0.1} />
                              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid 
                            strokeDasharray="3 3" 
                            stroke="#27272a" 
                            vertical={false}
                          />
                          <XAxis
                            dataKey="time"
                            stroke="#52525b"
                            tick={{ fill: '#71717a', fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            domain={[minPrice, maxPrice]}
                            stroke="#52525b"
                            tick={{ fill: '#71717a', fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${value.toFixed(2)}`}
                            width={70}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <ReferenceLine 
                            y={clearingPrice} 
                            stroke="#ef4444" 
                            strokeDasharray="5 5"
                            label={{ value: `$${clearingPrice.toFixed(4)}`, fill: '#ef4444', fontSize: 12 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#22c55e"
                            strokeWidth={2}
                            fill="url(#priceGradient)"
                            animationDuration={500}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-surface-500">
                        <BarChart3 size={48} className="mb-4 opacity-50" />
                        <p className="text-lg font-semibold">Waiting for price data...</p>
                        <p className="text-sm">Chart will appear as orders come in</p>
                        <div className="mt-8 p-6 bg-surface-800/50 rounded-xl text-center">
                          <div className="stat-label mb-2">Current Est. Clearing Price</div>
                          <div className="text-4xl font-mono font-bold text-accent-green">${formatters.price(clearingPrice)}</div>
                  </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* 📊 Auction Order Book (5 levels above/below) */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="xl:col-span-4 glass-card"
              >
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="text-primary-400">📊</span> Auction Book
                  </h2>
                  <div className="badge badge-info text-xs">
                    最近5档
                        </div>
                      </div>
                <div className="card-body">
                  {/* Header */}
                  <div className="grid grid-cols-3 gap-2 pb-2 border-b border-surface-800 text-xs text-surface-400 uppercase tracking-wider">
                    <span>Price</span>
                    <span className="text-right">Amount</span>
                    <span className="text-right">Cumulative</span>
                    </div>

                  {/* Above Clearing - 显示高于清算价格的最近5档（已匹配） */}
                  <div className="py-2">
                    {auctionOrderBook.above.length > 0 ? (
                      auctionOrderBook.above.map((row, i) => (
                        <div key={`above-${i}`} className="grid grid-cols-3 gap-2 py-2 relative">
                          <div 
                            className="absolute inset-y-0 right-0 bg-accent-green/10"
                            style={{ width: `${row.percent}%` }}
                          />
                          <span className="font-mono font-bold text-accent-green relative z-10">
                            {row.price.toFixed(2)}
                          </span>
                          <span className="font-mono text-right text-surface-300 relative z-10">
                            {row.tokens.toFixed(2)}
                          </span>
                          <span className="font-mono text-right text-surface-500 relative z-10">
                            {row.cumulative.toFixed(2)}
                          </span>
                        </div>
                      ))
                    ) : (
                      [5, 4, 3, 2, 1].map(i => (
                        <div key={`empty-above-${i}`} className="grid grid-cols-3 gap-2 py-2 opacity-30">
                          <span className="font-mono text-surface-600">--</span>
                          <span className="font-mono text-right text-surface-600">--</span>
                          <span className="font-mono text-right text-surface-600">--</span>
                      </div>
                      ))
                    )}
                  </div>

                  {/* Clearing Price Line */}
                  <div className="py-4 my-2 border-y-2 border-dashed border-accent-red/50 bg-accent-red/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-accent-red font-semibold uppercase">Est. Clearing</span>
                      <span className="text-2xl font-mono font-bold text-accent-red">
                        ${clearingPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-surface-500">Matched Volume</span>
                      <span className="text-sm font-mono text-surface-400">
                        {formatters.amount(Math.min(totalDemand, PROJECT_CONFIG.supplyPerRound))} wSPX
                      </span>
                    </div>
                    {/* 显示完整档位数 */}
                    <div className="flex items-center justify-between mt-1 text-xs text-surface-600">
                      <span>Total Levels: {orderBookRows.filter(r => r.price >= clearingPrice).length} above / {orderBookRows.filter(r => r.price < clearingPrice).length} below</span>
                </div>
              </div>

                  {/* Below Clearing - 显示低于清算价格的最近5档（未匹配） */}
                  <div className="py-2">
                    {auctionOrderBook.below.length > 0 ? (
                      auctionOrderBook.below.map((row, i) => (
                        <div key={`below-${i}`} className="grid grid-cols-3 gap-2 py-2 relative">
                          <div 
                            className="absolute inset-y-0 right-0 bg-surface-700/30"
                            style={{ width: `${row.percent}%` }}
                          />
                          <span className="font-mono font-bold text-surface-500 relative z-10">
                            {row.price.toFixed(2)}
                          </span>
                          <span className="font-mono text-right text-surface-500 relative z-10">
                            {row.tokens.toFixed(2)}
                          </span>
                          <span className="font-mono text-right text-surface-600 relative z-10">
                            {row.cumulative.toFixed(2)}
                          </span>
                    </div>
                      ))
                    ) : (
                      [1, 2, 3, 4, 5].map(i => (
                        <div key={`empty-below-${i}`} className="grid grid-cols-3 gap-2 py-2 opacity-30">
                          <span className="font-mono text-surface-600">--</span>
                          <span className="font-mono text-right text-surface-600">--</span>
                          <span className="font-mono text-right text-surface-600">--</span>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Stats */}
                  <div className="mt-4 pt-4 border-t border-surface-800">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-surface-500">Total Bids</div>
                        <div className="font-mono font-bold">{realBids.length}</div>
                  </div>
                      <div>
                        <div className="text-xs text-surface-500">Total Demand</div>
                        <div className="font-mono font-bold text-accent-green">{formatters.amount(totalDemand)}</div>
                </div>
                      <div>
                        <div className="text-xs text-surface-500">Supply</div>
                        <div className="font-mono font-bold">{PROJECT_CONFIG.supplyPerRound}</div>
              </div>
                      <div>
                        <div className="text-xs text-surface-500">Fill Rate</div>
                        <div className={`font-mono font-bold ${totalDemand >= PROJECT_CONFIG.supplyPerRound ? 'text-accent-green' : 'text-accent-yellow'}`}>
                          {Math.min(100, (totalDemand / PROJECT_CONFIG.supplyPerRound * 100)).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Wallet, Trade Form & Asset Account */}
            <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-all duration-500 ${isSettling ? 'blur-sm pointer-events-none' : ''}`}>
              {/* Asset Account */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card"
              >
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="text-primary-400">💰</span> Asset Account
                  </h2>
                </div>
                <div className="card-body">
                  <div className="mb-4">
                    <div className="stat-label flex items-center gap-2 mb-2">
                      <Wallet size={12} /> My Wallet (MetaMask)
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-xl p-3">
                        <div className="text-xs text-accent-blue font-semibold mb-1">USDC</div>
                        <div className="font-mono font-bold">{fmt(walletUsdc)}</div>
                      </div>
                      <div className="bg-primary-500/5 border border-primary-500/20 rounded-xl p-3">
                        <div className="text-xs text-primary-400 font-semibold mb-1">wSPX</div>
                        <div className="font-mono font-bold">{fmt(walletToken)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="stat-label flex items-center gap-2 mb-2">
                      <Zap size={12} /> Dabanc Account (Protocol)
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-surface-800/50 border border-surface-700 rounded-xl p-3">
                        <div className="text-xs text-surface-400 font-semibold mb-1">Trading USDC</div>
                        <div className="font-mono font-bold text-accent-green">{fmt(contractUsdcBalance)}</div>
                      </div>
                      <div className="bg-surface-800/50 border border-surface-700 rounded-xl p-3">
                        <div className="text-xs text-surface-400 font-semibold mb-1">Custody wSPX</div>
                        <div className="font-mono font-bold text-primary-400">{fmt(contractTokenBalance)}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="tab-group mb-4">
                    <button 
                      className={`tab-item ${selectedAsset === 'USDC' ? 'active' : ''}`}
                      onClick={() => setSelectedAsset('USDC')}
                    >
                      USDC
                    </button>
                    <button 
                      className={`tab-item ${selectedAsset === 'wSPX' ? 'active' : ''}`}
                      onClick={() => setSelectedAsset('wSPX')}
                    >
                      wSPX
                    </button>
                  </div>
                  
                  <div className="relative mb-4">
                    <input 
                      type="number" 
                      value={depositAmount} 
                      onChange={e => setDepositAmount(e.target.value)} 
                      placeholder="Enter amount..."
                      className="input-field pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500 font-semibold">
                      {selectedAsset}
                    </span>
                  </div>
                  
                  <div className="flex gap-3 mb-4">
                    <button 
                      className="btn-success flex-1 py-3"
                      onClick={handleDeposit} 
                      disabled={isPending || isSettling || selectedAsset === 'wSPX'}
                    >
                      {needsApproval ? `Approve` : 'Deposit'}
                    </button>
                    <button 
                      className="btn-secondary flex-1 py-3"
                      onClick={handleWithdraw} 
                      disabled={isPending || isSettling}
                    >
                      Withdraw
                    </button>
                  </div>
                  
                  <button 
                    className="text-accent-cyan text-sm hover:underline w-full text-center"
                    onClick={handleMint}
                  >
                    + Get Test USDC
                  </button>
                </div>
              </motion.div>

              {/* Place Order */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="glass-card"
              >
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="text-primary-400">📝</span> Place Bid Order
                  </h2>
                </div>
                <div className="card-body">
                  <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-surface-900/50 rounded-xl">
                    <div className="text-center">
                      <div className="text-xs text-surface-500 mb-1">USDC Balance</div>
                      <div className="font-mono text-accent-green text-lg font-bold">
                        {fmt(contractUsdcBalance)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-surface-500 mb-1">wSPX Holdings</div>
                      <div className="font-mono text-primary-400 text-lg font-bold">
                        {fmt(contractTokenBalance)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-4 py-2 bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg">
                    <Zap size={14} className="text-accent-yellow" />
                    <span className="text-xs text-accent-yellow font-semibold">Off-Chain Auction - Batch Settlement</span>
                     </div>

                  <div className="tab-group mb-4">
                    <button 
                      className={`tab-item ${orderType === 'limit' ? 'active' : ''}`}
                      onClick={() => setOrderType('limit')}
                    >
                      Limit
                    </button>
                    <button 
                      className={`tab-item ${orderType === 'market' ? 'active' : ''}`}
                      onClick={() => setOrderType('market')}
                    >
                      Market
                    </button>
                  </div>

                  {orderType === 'limit' ? (
                    <div className="relative mb-4">
                      <input 
                        type="number" 
                        value={limitPrice} 
                        onChange={e => setLimitPrice(e.target.value)} 
                        placeholder="Set Limit Price"
                        className="input-field pr-16"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500 font-semibold">
                        USDC
                      </span>
                    </div>
                  ) : (
                    <div className="relative mb-4 opacity-60">
                      <input 
                        type="text"
                        disabled
                        value="Market Price"
                        className="input-field pr-16 italic"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500 font-semibold">
                        USDC
                      </span>
                     </div>
                  )}
                  
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-surface-400 mb-2 font-semibold">
                    <span>Bid Amount</span>
                      <span>Max: {formatters.amount(maxSingleOrder)} wSPX</span>
                  </div>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        placeholder="0.00"
                        className="input-field pr-16"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500 font-semibold">
                        wSPX
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mb-4">
                    {[25, 50, 75, 100].map(p => (
                      <button 
                        key={p}
                        onClick={() => setAmountPercent(p)}
                        className="flex-1 py-2 text-xs font-semibold text-surface-400 bg-surface-800 
                                   rounded-lg hover:bg-surface-700 hover:text-accent-cyan transition-colors"
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                  
                  <div className="bg-surface-900/50 rounded-xl p-4 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-surface-400">Required USDC</span>
                      <span className="font-mono text-xl font-bold text-white">
                        {formatters.amount(totalCost)}
                      </span>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {orderWarning && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 bg-accent-yellow/20 rounded-xl text-accent-yellow text-sm mb-4"
                      >
                        <AlertCircle size={16} />
                        {orderWarning}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <AnimatePresence>
                    {txError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 p-3 bg-accent-red/20 rounded-xl text-accent-red text-sm mb-4"
                      >
                        <X size={16} />
                        {txError}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <button 
                    className="btn-success w-full py-4 text-lg uppercase tracking-wide"
                    onClick={handlePlaceOrder} 
                    disabled={!isWhitelisted || isPending || !amount || isSettling}
                  >
                    {isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <ArrowDownUp size={18} />
                        </motion.div>
                        Processing...
                      </span>
                    ) : !isWhitelisted ? 'KYC Required' : 'Confirm Bid wSPX'}
                  </button>

                  <div className="mt-4 p-3 bg-surface-900/30 rounded-xl text-xs text-surface-500">
                    <div className="flex justify-between">
                      <span>Trading Fee</span>
                      <span>0%</span>
                </div>
                    <div className="flex justify-between mt-1">
                      <span>Mode</span>
                      <span className="text-accent-yellow">⚡ Batch Auction</span>
              </div>
                  </div>
                </div>
              </motion.div>

              {/* Round Metrics */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass-card"
              >
                <div className="card-header">
                  <h2 className="card-title">
                    <span className="text-primary-400">📊</span> Round Metrics
                  </h2>
                    </div>
                <div className="card-body space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-surface-800">
                    <span className="text-surface-400">Round Supply</span>
                    <span className="font-mono font-bold">{PROJECT_CONFIG.supplyPerRound} wSPX</span>
                    </div>
                  <div className="flex justify-between items-center py-3 border-b border-surface-800">
                    <span className="text-surface-400">Total Demand</span>
                    <span className={`font-mono font-bold ${totalDemand > PROJECT_CONFIG.supplyPerRound ? 'text-accent-yellow' : 'text-accent-green'}`}>
                      {formatters.amount(totalDemand)} wSPX
                    </span>
                    </div>
                  <div className="flex justify-between items-center py-3 border-b border-surface-800">
                    <span className="text-surface-400">Your Orders</span>
                    <span className="font-mono font-bold text-primary-400">{formatters.amount(userCurrentOrders)} wSPX</span>
                    </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-surface-400">Progress</span>
                    <span className="font-mono font-bold">{Math.min(100, (totalDemand / PROJECT_CONFIG.supplyPerRound * 100)).toFixed(1)}%</span>
                    </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill bg-gradient-to-r from-accent-green to-accent-cyan"
                      style={{ width: `${Math.min(100, (totalDemand / PROJECT_CONFIG.supplyPerRound * 100))}%` }}
                    ></div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-accent-green/5 border border-accent-green/20 rounded-xl text-center">
                    <div className="stat-label">Projected Clearing</div>
                    <div className="text-3xl font-mono font-bold text-accent-green">${formatters.price(clearingPrice)}</div>
                </div>

                  <div className="p-4 bg-surface-800/50 rounded-xl">
                    <h3 className="font-semibold text-white mb-2 text-sm">How It Works</h3>
                    <ul className="text-xs text-surface-400 space-y-1">
                      <li>• Bids above clearing → Filled at clearing price</li>
                      <li>• Bids below clearing → Not filled (returned)</li>
                      <li>• Single clearing price for all</li>
                    </ul>
              </div>
                </div>
              </motion.div>
            </div>
          </>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 glass-card"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-4xl shadow-xl shadow-primary-500/30 mb-6">
              <Wallet size={40} />
          </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to Dabanc Launchpad</h2>
            <p className="text-surface-400 mb-8">Connect your wallet to participate in the auction</p>
            <ConnectButton />
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-surface-800/50 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-surface-500 text-sm">
          <p>Dabanc Launchpad - Off-chain Order Matching, On-chain Settlement</p>
          <p className="mt-2 text-surface-600">
            ⚡ Powered by Ethereum | 🔒 Secure & Transparent
          </p>
        </div>
      </footer>
    </div>
  );
}
