/**
 * Dabanc Launchpad - Ultimate v8.1 (Fixed & Enhanced)
 * 1. Fixed wSPX Deposit Logic 🔧
 * 2. New Spinner Animation 🌀
 * 3. Wallet Balance Display 🦊
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
import axios from 'axios';
import { 
  AUCTION_ADDRESS, 
  USDC_ADDRESS, 
  TOKEN_ADDRESS, // ⚠️ 请确保 constants.ts 里导出了这个
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

// 🔧 Config: Limits kept high for testing
const MAX_SINGLE_ORDER_PERCENT = 5.0; 
const MAX_PER_USER_PERCENT = 100.0; 

export default function App() {
  const { address, isConnected } = useAccount();
  
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [selectedAsset, setSelectedAsset] = useState<'USDC' | 'wSPX'>('USDC');
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [realBids, setRealBids] = useState<Bid[]>([]); 
  const [txError, setTxError] = useState<string | null>(null);
  const [, setStep] = useState<string>('idle');
  
  // 🌟 Settlement State
  const [showResult, setShowResult] = useState(false);
  const [lastAllocated, setLastAllocated] = useState({ amount: 0, price: 0, roundId: 0 });
  
  const prevTokenBalance = useRef<bigint>(0n);
  const prevRoundId = useRef<number>(0);

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
    return !isRoundActive && timeLeft <= 0;
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
    if (currentRoundId) {
      prevRoundId.current = Number(currentRoundId);
    }
  }, [currentRoundId]);

  useEffect(() => {
    if (!currentRoundId) return;
    const fetchOrderBook = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/orders?roundId=${currentRoundId}`);
        if (res.data && Array.isArray(res.data)) setRealBids(res.data);
      } catch (e) {}
    };
    fetchOrderBook(); 
    const interval = setInterval(fetchOrderBook, 1000); 
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

    const priceGroups: Record<string, { tokens: number; usdc: number }> = {};
    sorted.forEach(bid => {
      if (!bid || bid.limitPrice === null || bid.limitPrice === undefined) return;
      
      const priceKey = Number(bid.limitPrice).toFixed(4);
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
    let estimated = requestedTokens;
    
    if (requestedTokens > maxSingle) {
      warning = `Max per order: ${formatters.amount(maxSingle)} wSPX`;
      estimated = maxSingle;
    } else if (requestedTokens > userRemaining && userRemaining < maxSingle) {
      warning = `Remaining quota: ${formatters.amount(userRemaining)} wSPX`;
      estimated = userRemaining;
    }
    
    return { totalCost: cost, orderWarning: warning, maxSingleOrder: effectiveMax };
  }, [amount, limitPrice, orderType, clearingPrice, userCurrentOrders, totalDemand]);

  // 🔧 FIX: Corrected Approval Logic
  const needsApproval = useMemo(() => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return false;
    
    if (selectedAsset === 'USDC') {
      if (!usdcAllowance) return true;
      return Number(formatEther(usdcAllowance)) < parseFloat(depositAmount);
    } else {
      // wSPX Case
      if (!tokenAllowance) return true;
      return Number(formatEther(tokenAllowance)) < parseFloat(depositAmount);
    }
  }, [usdcAllowance, tokenAllowance, depositAmount, selectedAsset]);

  // 🔧 FIX: Corrected Deposit Logic
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

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .app {
          min-height: 100vh;
          color: #f0f6fc;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 14px; 
          background: radial-gradient(circle at 50% 10%, #1c2128 0%, #0d1117 100%);
          background-size: 200% 200%;
          animation: bgPulse 20s ease infinite alternate;
        }
        @keyframes bgPulse {
          0% { background-position: 50% 0%; }
          100% { background-position: 50% 100%; }
        }

        .container { max-width: 1400px; margin: 0 auto; padding: 16px 20px; position: relative; }
        
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; } 
        .logo { display: flex; align-items: center; gap: 12px; }
        .logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #a855f7, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: white; font-size: 18px; box-shadow: 0 0 20px rgba(168, 85, 247, 0.4); }
        .logo-text { font-size: 20px; font-weight: 700; color: white; }
        
        .card { 
          background: rgba(22, 27, 34, 0.75); 
          backdrop-filter: blur(12px);
          border: 1px solid rgba(48, 54, 61, 0.6); 
          border-radius: 16px; 
          overflow: hidden; 
          height: 100%; 
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s, border-color 0.2s;
        }
        .card:hover { border-color: #58a6ff; }

        .price-section { 
          display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 20px; align-items: center;
          padding: 20px 28px; 
          background: rgba(13, 17, 23, 0.8); backdrop-filter: blur(10px);
          border-radius: 16px; border: 1px solid #30363d; margin-bottom: 24px; 
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .main-price { font-family: 'JetBrains Mono', monospace; font-size: 40px; font-weight: 700; color: #3fb950; text-shadow: 0 0 15px rgba(63, 185, 80, 0.3); }
        
        .stats-group { display: flex; justify-content: space-around; gap: 20px; }
        .stat-item { display: flex; flex-direction: column; align-items: center; }
        .stat-label { font-size: 16px; color: #8b949e; text-transform: uppercase; margin-bottom: 6px; font-weight: 800; letter-spacing: 0.5px; } 
        .stat-val { font-family: 'JetBrains Mono', monospace; font-size: 25px; font-weight: 800; color: #f0f6fc; } 
        
        .status-area { text-align: right; }
        .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: rgba(63, 185, 80, 0.1); border: 1px solid rgba(63, 185, 80, 0.4); border-radius: 20px; font-size: 12px; color: #3fb950; font-weight: 600; box-shadow: 0 0 10px rgba(63, 185, 80, 0.1); }
        .status-dot { width: 6px; height: 6px; background: #3fb950; border-radius: 50%; animation: pulse 2s infinite; }
        
        .layout-top { display: grid; grid-template-columns: 1fr 380px; gap: 20px; margin-bottom: 20px; }
        .layout-bottom { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }

        .card-head { padding: 16px 20px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); }
        .card-title { font-size: 14px; font-weight: 700; color: #f0f6fc; text-transform: uppercase; letter-spacing: 0.8px; display: flex; align-items: center; gap: 8px; }
        .card-body { padding: 16px; display: flex; flex-direction: column; justify-content: center; height: calc(100% - 53px); }
        
        .ob-header {
            display: grid;
            grid-template-columns: 100px 1fr 90px 90px;
            gap: 12px;
            padding: 0 0 10px 0;
            border-bottom: 1px solid #30363d;
            margin-bottom: 10px;
            font-size: 11px;
            color: #8b949e;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .ob-scroll { max-height: 340px; overflow-y: auto; }
        .ob-scroll::-webkit-scrollbar { width: 4px; }
        .ob-scroll::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
        
        .ob-row { display: grid; grid-template-columns: 100px 1fr 90px 90px; gap: 12px; padding: 7px 0; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; transition: background 0.15s; }
        .ob-row:hover { background: rgba(255,255,255,0.04); }
        .ob-price { font-weight: 700; font-size: 14px; }
        
        .clearing-line { padding: 12px 0; border-top: 1px dashed rgba(248, 81, 73, 0.5); border-bottom: 1px dashed rgba(248, 81, 73, 0.5); margin: 12px 0; background: rgba(248, 81, 73, 0.08); }
        .clearing-price-big { font-size: 20px; font-weight: 700; color: #f85149; text-align: center; display: block; }
        .clearing-tag { font-size: 11px; color: #f85149; text-align: center; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
        
        /* 🚀 Updated Settling Animation (Spinner) */
        .settling-overlay { 
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(16px); 
          display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 999; 
          animation: zoomIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        
        .settling-card {
            background: #0d1117; border: 1px solid #a855f7; border-radius: 24px; padding: 56px 48px; 
            width: 460px; text-align: center; box-shadow: 0 0 80px rgba(168, 85, 247, 0.2);
            position: relative; overflow: hidden;
        }

        .settling-spinner {
            width: 48px; height: 48px;
            border: 4px solid rgba(168, 85, 247, 0.2); 
            border-top: 4px solid #a855f7;             
            border-radius: 50%;
            margin: 0 auto 32px;                       
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .settling-logo { 
          width: 80px; height: 80px; background: #a855f7; border-radius: 20px; margin: 0 auto 24px;
          display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 800; color: white; 
          box-shadow: 0 0 30px rgba(168, 85, 247, 0.5);
          animation: pulse-logo 2s infinite;
        }
        @keyframes pulse-logo { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
        
        .settling-text { font-size: 24px; font-weight: 700; color: white; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .settling-sub { font-size: 14px; color: #a855f7; margin-bottom: 32px; font-family: 'JetBrains Mono', monospace; }

        /* Timer Box */
        .timer-box { text-align: center; padding: 24px 20px; background: rgba(168, 85, 247, 0.05); border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.3); box-shadow: inset 0 0 20px rgba(168, 85, 247, 0.05); }
        .timer-label { font-size: 13px; font-weight: 700; color: #a855f7; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .timer-num { font-family: 'JetBrains Mono', monospace; font-size: 52px; font-weight: 700; color: #f0f6fc; line-height: 1; text-shadow: 0 0 20px rgba(168, 85, 247, 0.3); }
        .timer-num.urgent { color: #f85149; text-shadow: 0 0 20px rgba(248, 81, 73, 0.3); }
        .timer-bar { height: 6px; background: #30363d; border-radius: 3px; margin-top: 16px; overflow: hidden; }
        .timer-bar-fill { height: 100%; background: linear-gradient(90deg, #a855f7, #7c3aed); border-radius: 3px; transition: width 1s linear; box-shadow: 0 0 10px #a855f7; }
        
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(10px); animation: fadeIn 0.3s ease; }
        .modal-card { background: #0d1117; border: 1px solid #3fb950; border-radius: 20px; padding: 40px; width: 420px; text-align: center; box-shadow: 0 0 60px rgba(63, 185, 80, 0.2); }
        .modal-title { font-size: 24px; font-weight: 700; margin-bottom: 10px; color: #3fb950; text-transform: uppercase; letter-spacing: 1px; }
        .modal-val { font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; color: #f0f6fc; margin: 12px 0; }
        .modal-btn { background: #3fb950; color: white; border: none; padding: 14px; border-radius: 10px; font-weight: 700; font-size: 15px; cursor: pointer; margin-top: 28px; width: 100%; transition: 0.2s; box-shadow: 0 4px 12px rgba(63, 185, 80, 0.3); }
        .modal-btn:hover { background: #2ea043; transform: translateY(-1px); }
        
        /* Inputs & Buttons */
        .input-group { background: #0d1117; border: 1px solid #30363d; border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; margin-bottom: 12px; transition: border 0.2s; }
        .input-group:focus-within { border-color: #58a6ff; box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2); }
        .input-group.disabled { background: #161b22; border-color: #21262d; opacity: 0.6; }
        .input-group input { flex: 1; background: none; border: none; color: white; font-size: 16px; font-family: 'JetBrains Mono', monospace; font-weight: 600; outline: none; }
        .input-group input:disabled { cursor: not-allowed; color: #8b949e; }
        .input-suffix { color: #8b949e; font-size: 13px; margin-left: 10px; font-weight: 600; }
        
        .btn-row { display: flex; gap: 10px; margin-bottom: 14px; }
        .btn { flex: 1; padding: 12px; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; transition: 0.2s; }
        .btn-primary { background: linear-gradient(135deg, #238636, #2ea043); color: white; box-shadow: 0 2px 8px rgba(35, 134, 54, 0.3); }
        .btn-primary:hover { filter: brightness(1.1); }
        .btn-secondary { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
        .btn-secondary:hover { background: #30363d; }
        
        .bal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .bal-box { background: #0d1117; padding: 14px; border-radius: 10px; border: 1px solid #30363d; }
        .bal-label { font-size: 11px; color: #8b949e; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
        .bal-val { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; color: #f0f6fc; }
        
        .pct-btns { display: flex; gap: 8px; margin-bottom: 16px; }
        .pct-btn { flex: 1; padding: 8px; background: #21262d; border: 1px solid #30363d; border-radius: 8px; color: #8b949e; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.15s; }
        .pct-btn:hover { border-color: #58a6ff; color: #58a6ff; background: rgba(88, 166, 255, 0.1); }
        
        .total-box { background: #0d1117; padding: 14px; border-radius: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #30363d; }
        .total-label { color: #8b949e; font-size: 13px; font-weight: 600; }
        .total-val { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: #f0f6fc; }
        
        .warning-msg { padding: 10px 12px; background: rgba(227, 179, 65, 0.1); border: 1px solid rgba(227, 179, 65, 0.3); border-radius: 8px; color: #e3b341; font-size: 13px; margin-bottom: 12px; }
        .error-msg { padding: 10px 12px; background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 8px; color: #f85149; font-size: 13px; margin-bottom: 12px; }
        
        .order-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #238636, #2ea043); border: none; border-radius: 12px; color: white; font-size: 16px; font-weight: 700; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 15px rgba(35, 134, 54, 0.4); text-transform: uppercase; letter-spacing: 0.5px; }
        .order-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(35, 134, 54, 0.5); }
        .order-btn:disabled { background: #21262d; color: #484f58; transform: none; box-shadow: none; cursor: not-allowed; border: 1px solid #30363d; }
        
        .mint-link { display: block; text-align: center; margin-top: 12px; font-size: 12px; color: #58a6ff; cursor: pointer; transition: 0.2s; }
        .mint-link:hover { color: #79c0ff; text-decoration: underline; }

        .stats-list { display: flex; flex-direction: column; gap: 12px; }
        .stats-row { display: flex; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid #21262d; }
        .stats-row:last-child { border-bottom: none; }
        .stats-row-label { color: #8b949e; font-size: 15px; font-weight: 700; }
        .stats-row-val { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 800; color: #f0f6fc; }
        
        .tab-row { display: flex; background: #0d1117; padding: 4px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #30363d; }
        .tab { flex: 1; padding: 10px; border: none; border-radius: 8px; background: none; color: #8b949e; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; }
        .tab.active { background: #21262d; color: #f0f6fc; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        
        .connect-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; gap: 16px; }
      `}</style>

      {/* 🚀 Settlement Popup Overlay (Clean Spinner Version) */}
      {isSettling && !showResult && (
        <div className="settling-overlay">
          <div className="settling-card">
            <div className="settling-logo">⚡️</div>
            <div className="settling-text">Settlement in Progress</div>
            <div className="settling-sub">Executing smart contract clearing logic...</div>
            <div className="settling-spinner"></div>
          </div>
        </div>
      )}

      {/* 🌟 Result Modal */}
      {showResult && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-title">🎉 Settlement Complete</div>
            <p style={{color: '#8b949e', fontSize: '13px'}}>Results for Round #{lastAllocated.roundId}</p>
            <div style={{margin: '24px 0'}}>
              <div style={{fontSize: '12px', color: '#8b949e', textTransform: 'uppercase'}}>You Received</div>
              <div className="modal-val">{lastAllocated.amount.toFixed(2)} wSPX</div>
              <div style={{fontSize: '12px', color: '#8b949e', marginTop: '16px', textTransform: 'uppercase'}}>Avg. Price</div>
              <div className="modal-val" style={{color: '#3fb950'}}>${lastAllocated.price.toFixed(4)}</div>
            </div>
            <button className="modal-btn" onClick={() => setShowResult(false)}>Awesome!</button>
          </div>
        </div>
      )}

      <div className="container">
        <header className="header">
          <div className="logo">
            <div className="logo-icon">D</div>
            <div>
              <div className="logo-text">Dabanc</div>
              <div style={{fontSize: '11px', color: '#8b949e'}}>Next-Gen RWA Launchpad</div>
            </div>
          </div>
          <ConnectButton />
        </header>

        {/* 🌟 Price Section */}
        <div className="price-section">
          <div>
            <div style={{fontSize: '12px', color: '#8b949e', marginBottom: '6px', fontWeight: 600}}>EST. CLEARING PRICE</div>
            <div className="main-price">${formatters.price(clearingPrice)}</div>
            <div style={{fontSize: '12px', color: '#8b949e', marginTop: '4px'}}>wSPX / USDC</div>
          </div>
          
          <div className="stats-group">
            <div className="stat-item">
              <span className="stat-label">24H High</span>
              <span className="stat-val" style={{color: '#3fb950'}}>${formatters.price(stats.high || clearingPrice)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">24H Low</span>
              <span className="stat-val" style={{color: '#f85149'}}>${formatters.price(stats.low || clearingPrice)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Volume</span>
              <span className="stat-val" style={{color: '#58a6ff'}}>${formatters.amount(stats.volume)}</span>
            </div>
          </div>
          
          <div className="status-area">
            <div className="status-badge">
              <span className="status-dot"></span>
              LIVE
            </div>
            <div style={{fontSize: '11px', color: '#8b949e', marginTop: '8px', fontWeight: 600}}>Round #{currentRoundId?.toString() || '1'}</div>
          </div>
        </div>

        {isConnected ? (
          <>
            {/* 🌟 Layout Top: Order Book + Timer */}
            <div className="layout-top" style={{filter: isSettling ? 'blur(10px)' : 'none', pointerEvents: isSettling ? 'none' : 'auto', transition: 'filter 0.5s'}}>
              <div className="card">
                <div className="card-head"><span className="card-title">📊 Order Book</span></div>
                <div className="card-body">
                  <div className="ob-header">
                    <span>Price (USDC)</span>
                    <span>Depth</span>
                    <span style={{textAlign: 'right'}}>Amount</span>
                    <span style={{textAlign: 'right'}}>Value</span>
                  </div>

                  <div className="ob-scroll">
                    {orderBookRows.filter(r => r.isAboveClearing).map((row, i) => (
                      <div key={i} className="ob-row">
                        <span className="ob-price" style={{color: '#3fb950'}}>{row.price.toFixed(4)}</span>
                        <div style={{height: '20px', background: 'rgba(63, 185, 80, 0.1)', borderRadius: '4px', position: 'relative'}}>
                          <div style={{height: '100%', background: 'rgba(63, 185, 80, 0.4)', width: `${(row as any).percent}%`, borderRadius: '4px'}}></div>
                        </div>
                        <span style={{textAlign: 'right', color: '#e6edf3'}}>{row.tokens.toFixed(2)}</span>
                        <span style={{textAlign: 'right', color: '#8b949e'}}>{formatters.amount(row.usdc)}</span>
                      </div>
                    ))}
                    <div className="clearing-line">
                      <div className="clearing-price-big">${formatters.price(clearingPrice)}</div>
                      <div className="clearing-tag">Est. Clearing Price</div>
                    </div>
                    {orderBookRows.filter(r => !r.isAboveClearing).map((row, i) => (
                      <div key={i} className="ob-row">
                        <span className="ob-price" style={{color: '#8b949e'}}>{row.price.toFixed(4)}</span>
                        <div style={{height: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', position: 'relative'}}>
                          <div style={{height: '100%', background: 'rgba(255,255,255,0.08)', width: `${(row as any).percent}%`, borderRadius: '4px'}}></div>
                        </div>
                        <span style={{textAlign: 'right', color: '#8b949e'}}>{row.tokens.toFixed(2)}</span>
                        <span style={{textAlign: 'right', color: '#484f58'}}>{formatters.amount(row.usdc)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><span className="card-title">⏱️ Auction Status</span></div>
                <div className="card-body">
                  <div className="timer-box">
                    <div className="timer-label">Ends In</div>
                    <div className={`timer-num ${timeLeft < 60 ? 'urgent' : ''}`}>{formatTime(timeLeft)}</div>
                    <div className="timer-bar">
                      <div className="timer-bar-fill" style={{width: `${((PROJECT_CONFIG.roundDuration - timeLeft) / PROJECT_CONFIG.roundDuration) * 100}%`}}></div>
                    </div>
                  </div>
                  
                  <div style={{marginTop: '20px', padding: '16px', background: 'rgba(63, 185, 80, 0.05)', border: '1px solid rgba(63, 185, 80, 0.2)', borderRadius: '12px', textAlign: 'center'}}>
                    <div style={{fontSize: '11px', color: '#8b949e', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 600}}>Projected Price</div>
                    <div style={{fontFamily: 'JetBrains Mono', fontSize: '28px', fontWeight: '800', color: '#3fb950'}}>${formatters.price(clearingPrice)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 🌟 Layout Bottom: Asset + Bid + Metrics */}
            <div className="layout-bottom" style={{filter: isSettling ? 'blur(10px)' : 'none', pointerEvents: isSettling ? 'none' : 'auto', transition: 'filter 0.5s'}}>
              {/* 1. Asset Account (Enhanced with Wallet Balances) */}
              <div className="card">
                <div className="card-head"><span className="card-title">💰 Asset Account</span></div>
                <div className="card-body">
                  
                  {/* MetaMask Balances */}
                  <div style={{marginBottom: '16px'}}>
                    <div style={{fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      <span>🦊 My Wallet (MetaMask)</span>
                    </div>
                    <div className="bal-grid">
                      <div className="bal-box" style={{borderColor: 'rgba(88, 166, 255, 0.3)', background: 'rgba(88, 166, 255, 0.05)'}}>
                        <div className="bal-label" style={{color: '#58a6ff'}}>Wallet USDC</div>
                        <div className="bal-val">{fmt(walletUsdc)}</div>
                      </div>
                      <div className="bal-box" style={{borderColor: 'rgba(168, 85, 247, 0.3)', background: 'rgba(168, 85, 247, 0.05)'}}>
                        <div className="bal-label" style={{color: '#a855f7'}}>Wallet wSPX</div>
                        <div className="bal-val">{fmt(walletToken)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Protocol Balances */}
                  <div style={{marginBottom: '16px'}}>
                    <div style={{fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', marginBottom: '8px'}}>
                      <span>🏛️ Dabanc Account (Protocol)</span>
                    </div>
                    <div className="bal-grid">
                      <div className="bal-box">
                        <div className="bal-label">Trading USDC</div>
                        <div className="bal-val">{fmt(contractUsdcBalance)}</div>
                      </div>
                      <div className="bal-box">
                        <div className="bal-label">Custody wSPX</div>
                        <div className="bal-val" style={{color: '#a855f7'}}>{fmt(contractTokenBalance)}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="tab-row">
                    <button className={`tab ${selectedAsset === 'USDC' ? 'active' : ''}`} onClick={() => setSelectedAsset('USDC')}>USDC</button>
                    <button className={`tab ${selectedAsset === 'wSPX' ? 'active' : ''}`} onClick={() => setSelectedAsset('wSPX')}>wSPX</button>
                  </div>
                  
                  <div className="input-group">
                    <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Enter amount..." />
                    <span className="input-suffix">{selectedAsset}</span>
                  </div>
                  
                  <div className="btn-row">
                    <button className="btn btn-primary" onClick={handleDeposit} disabled={isPending || isSettling || selectedAsset === 'wSPX'}>
                      {needsApproval ? `Approve ${selectedAsset}` : 'Deposit'}
                    </button>
                    <button className="btn btn-secondary" onClick={handleWithdraw} disabled={isPending || isSettling}>Withdraw</button>
                  </div>
                  
                  <span className="mint-link" onClick={handleMint}>+ Get Test USDC</span>
                </div>
              </div>

              {/* 2. Place Bid Order */}
              <div className="card">
                <div className="card-head"><span className="card-title">📝 Place Bid Order</span></div>
                <div className="card-body">
                  <div className="tab-row">
                    <button className={`tab ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Limit</button>
                    <button className={`tab ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Market</button>
                  </div>

                  {orderType === 'limit' && (
                     <div className="input-group">
                       <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} placeholder="Set Limit Price" />
                       <span className="input-suffix">USDC</span>
                     </div>
                  )}
                  {orderType === 'market' && (
                     <div className="input-group disabled">
                       <input type="text" disabled value="Market Price" style={{fontStyle: 'italic', opacity: 0.7}} />
                       <span className="input-suffix">USDC</span>
                     </div>
                  )}
                  
                  <div style={{marginBottom: '6px', fontSize: '12px', color: '#8b949e', display: 'flex', justifyContent: 'space-between', fontWeight: 600}}>
                    <span>Bid Amount</span>
                    <span>Max: {formatters.amount(maxSingleOrder)}</span>
                  </div>
                  <div className="input-group">
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                    <span className="input-suffix">wSPX</span>
                  </div>
                  
                  <div className="pct-btns">
                    {[25, 50, 75, 100].map(p => <button key={p} className="pct-btn" onClick={() => setAmountPercent(p)}>{p}%</button>)}
                  </div>
                  
                  <div className="total-box">
                    <span className="total-label">Required USDC</span>
                    <span className="total-val">{formatters.amount(totalCost)}</span>
                  </div>
                  
                  {orderWarning && <div className="warning-msg">⚠️ {orderWarning}</div>}
                  {txError && <div className="error-msg">{txError}</div>}
                  
                  <button className="order-btn" onClick={handlePlaceOrder} disabled={!isWhitelisted || isPending || !amount || isSettling}>
                    {isPending ? 'PROCESSING...' : !isWhitelisted ? 'KYC REQUIRED' : 'CONFIRM BID wSPX'}
                  </button>
                </div>
              </div>

              {/* 3. Round Metrics */}
              <div className="card">
                <div className="card-head"><span className="card-title">📊 Round Metrics</span></div>
                <div className="card-body">
                  <div className="stats-list">
                    <div className="stats-row">
                      <span className="stats-row-label">Round Supply</span>
                      <span className="stats-row-val">{PROJECT_CONFIG.supplyPerRound} wSPX</span>
                    </div>
                    <div className="stats-row">
                      <span className="stats-row-label">Total Demand</span>
                      <span className="stats-row-val" style={{color: totalDemand > PROJECT_CONFIG.supplyPerRound ? '#e3b341' : '#3fb950'}}>{formatters.amount(totalDemand)}</span>
                    </div>
                    <div className="stats-row">
                      <span className="stats-row-label">Max Per User</span>
                      <span className="stats-row-val">{PROJECT_CONFIG.supplyPerRound * 1}</span>
                    </div>
                    <div className="stats-row">
                      <span className="stats-row-label">Progress</span>
                      <span className="stats-row-val">{Math.min(100, (totalDemand / PROJECT_CONFIG.supplyPerRound * 100)).toFixed(1)}%</span>
                    </div>
                    <div style={{marginTop: '20px', height: '8px', width: '100%', background: '#21262d', borderRadius: '4px', overflow: 'hidden'}}>
                      <div style={{height: '100%', width: `${Math.min(100, (totalDemand / PROJECT_CONFIG.supplyPerRound * 100))}%`, background: '#3fb950', boxShadow: '0 0 10px rgba(63, 185, 80, 0.5)'}}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="connect-wrap">
            <div style={{fontSize: '24px', fontWeight: 700}}>Welcome to Dabanc Launchpad</div>
            <p style={{color: '#8b949e'}}>Connect your wallet to participate in the auction</p>
            <ConnectButton />
          </div>
        )}
      </div>
    </div>
  );
}