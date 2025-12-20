/**
 * Dabanc Launchpad - CEX 极速交易模式前端 (UI/UX 优化版)
 * 优化点：清晰区分外部钱包资金与内部交易资金
 */

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { 
  useAccount, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt, 
  useChainId
} from 'wagmi';
import { useState, useEffect, useMemo } from 'react';
import { parseEther, formatEther } from 'viem';
import axios from 'axios';
import { 
  AUCTION_ADDRESS, 
  USDC_ADDRESS, 
  AUCTION_ABI, 
  USDC_ABI, 
  PROJECT_CONFIG,
  AuctionPhase,
  formatters,
  getFriendlyError,
  API_URL 
} from './constants';

// === 类型定义 ===
interface Bid {
  user: string;
  amount: number;
  limitPrice: number;
  timestamp: number;
  txHash: string;
  status: 'pending' | 'confirmed';
}

interface UserEstimate {
  wouldMatch: boolean;
  estimatedTokens: number;
  refund: number;
  currentClearingPrice: number;
}

interface SettlementReport {
  totalBid: number;
  tokensAllocated: number;
  refundAmount: number;
  actualCost: number;
  hasClaimed: boolean;
  hasRefunded: boolean;
}

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const networkName = chainId === 11155111 ? 'Sepolia' : chainId === 31337 ? 'Anvil' : `Chain ${chainId}`;
  
  // === 状态管理 ===
  const [amount, setAmount] = useState('500');
  const [limitPrice, setLimitPrice] = useState('12.00');
  const [depositAmount, setDepositAmount] = useState('1000');
  const [timeLeft, setTimeLeft] = useState(0);
  
  const [realBids, setRealBids] = useState<Bid[]>([]); 
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'syncing' | 'error'>('connected');
  const [txError, setTxError] = useState<string | null>(null);
  
  const [step, setStep] = useState<string>('idle');
  
  const { writeContract, data: hash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // === 1. 链上数据读取 ===
  const { data: isRoundActive } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'isRoundActive', query: { refetchInterval: 5000 }
  });
  const { data: currentRoundId } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'currentRoundId', query: { refetchInterval: 5000 }
  });
  const { data: lastClearingTime } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'lastClearingTime', query: { refetchInterval: 5000 }
  });
  const { data: roundData } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'rounds', args: currentRoundId ? [currentRoundId] : undefined, query: { refetchInterval: 5000 }
  });

  // === 2. 资金与用户数据 ===
  // 外部钱包 (MetaMask)
  const { data: usdcBalance, refetch: refetchWallet } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, query: { refetchInterval: 3000 }
  });
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'allowance', args: address ? [address, AUCTION_ADDRESS] : undefined, query: { refetchInterval: 3000 }
  });
  // 内部账户 (Dabanc Exchange)
  const { data: contractBalance, refetch: refetchDeposited } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'userBalances', args: address ? [address] : undefined, query: { refetchInterval: 2000 }
  });
  const { data: isWhitelisted } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'isWhitelisted', args: address ? [address] : undefined,
  });

  // 结算详情查询
  const settlementRoundId = useMemo(() => {
    if (!currentRoundId) return 0n;
    if (isRoundActive) return currentRoundId > 1n ? currentRoundId - 1n : 0n; 
    return currentRoundId; 
  }, [currentRoundId, isRoundActive]);

  const { data: userBidDetails, refetch: refetchDetails } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'getUserBidDetails', 
    args: (settlementRoundId > 0n && address) ? [settlementRoundId, address] : undefined,
    query: { refetchInterval: 5000 }
  });

  const settlementReport: SettlementReport | null = useMemo(() => {
    if (!userBidDetails || settlementRoundId === 0n) return null;
    // @ts-ignore
    const [total, allocated, refund, claimed, refunded] = userBidDetails;
    if (total === 0n && allocated === 0n) return null;

    return {
      totalBid: Number(formatEther(total)),
      tokensAllocated: Number(formatEther(allocated)),
      refundAmount: Number(formatEther(refund)),
      actualCost: Number(formatEther(total - refund)),
      hasClaimed: claimed,
      hasRefunded: refunded
    };
  }, [userBidDetails, settlementRoundId]);


  // === 3. 轮询 API ===
  useEffect(() => {
    if (!currentRoundId) return;
    const fetchOrderBook = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/orders?roundId=${currentRoundId}`);
        if (res.data && Array.isArray(res.data)) {
          setRealBids(res.data);
          setLastUpdate(Date.now());
          setNetworkStatus('connected');
        }
      } catch (e) {
        // quiet fail
      }
    };
    fetchOrderBook(); 
    const interval = setInterval(fetchOrderBook, 1000); 
    return () => clearInterval(interval);
  }, [currentRoundId]);

  // === 4. 倒计时 ===
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

  // 交易确认后刷新
  useEffect(() => {
    if (isConfirmed) {
      refetchWallet(); refetchAllowance(); refetchDeposited(); refetchDetails();
      reset();
      
      if (step === 'approving') {
        setStep('ready_to_deposit'); 
      } else {
        setStep('idle');
      }
      setTxError(null);
    }
  }, [isConfirmed]);

  useEffect(() => {
    if (writeError) {
      setTxError(getFriendlyError(writeError));
      setStep('idle');
    }
  }, [writeError]);

  // === 5. 撮合引擎 ===
  const { estimatedPrice, totalDemand, orderBookDisplay, depthData, userEstimate } = useMemo(() => {
    if (realBids.length === 0) return { estimatedPrice: 1.0, totalDemand: 0, orderBookDisplay: [], depthData: [], userEstimate: null };
    
    const sortedBids = [...realBids].sort((a, b) => b.limitPrice - a.limitPrice);
    const SUPPLY = PROJECT_CONFIG.supplyPerRound;
    
    let accumulated = 0;
    let clearingPrice = 1.0;
    let clearingIndex = -1;

    for (let i = 0; i < sortedBids.length; i++) {
      const bid = sortedBids[i];
      accumulated += bid.amount / bid.limitPrice;
      if (accumulated >= SUPPLY && clearingIndex === -1) {
        clearingPrice = bid.limitPrice;
        clearingIndex = i;
      }
    }
    if (accumulated < SUPPLY && sortedBids.length > 0) clearingPrice = sortedBids[sortedBids.length - 1].limitPrice;
    clearingPrice = Math.max(0.01, clearingPrice);

    const display = sortedBids.slice(0, 10).map((b, i) => ({
      price: b.limitPrice,
      volume: b.amount,
      user: b.user,
      isMatched: b.limitPrice >= clearingPrice,
      isMarginal: i === clearingIndex
    }));

    const priceGroups: Record<string, number> = {};
    sortedBids.forEach(b => {
      const p = Math.floor(b.limitPrice).toString();
      priceGroups[p] = (priceGroups[p] || 0) + b.amount;
    });
    const depth = Object.entries(priceGroups).map(([p, v]) => ({ price: parseFloat(p), volume: v })).sort((a, b) => b.price - a.price);

    let userEst = null;
    if (amount && limitPrice) {
      const p = parseFloat(limitPrice);
      const a = parseFloat(amount);
      if (!isNaN(p) && !isNaN(a) && p > 0) {
        const match = p >= clearingPrice;
        userEst = { wouldMatch: match, estimatedTokens: match ? a / clearingPrice : 0, refund: match ? 0 : a, currentClearingPrice: clearingPrice };
      }
    }
    
    return { estimatedPrice: clearingPrice, totalDemand: accumulated, orderBookDisplay: display, depthData: depth, userEstimate: userEst };
  }, [realBids, amount, limitPrice]);

  // === 6. 交互函数 ===

  const needsApproval = useMemo(() => {
    if (!usdcAllowance || !depositAmount) return true;
    return Number(formatEther(usdcAllowance)) < parseFloat(depositAmount);
  }, [usdcAllowance, depositAmount]);

  const handleSmartDeposit = () => {
    setTxError(null);
    if (needsApproval) {
        setStep('approving');
        writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [AUCTION_ADDRESS, parseEther(depositAmount)] });
    } else {
        setStep('depositing');
        writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'deposit', args: [parseEther(depositAmount)] });
    }
  };

  const handleWithdraw = () => {
    setTxError(null); setStep('withdrawing');
    writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'withdraw', args: [parseEther(depositAmount)] });
  };

  const handleMint = () => {
    writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'mint', args: [address!, parseEther('10000')] });
  };

  const handleClaimTokens = () => {
    if(!settlementRoundId) return;
    writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'claimTokens', args: [settlementRoundId] });
  };

  const handleClaimRefund = () => {
    if(!settlementRoundId) return;
    writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'claimRefund', args: [settlementRoundId] });
  };

  const handlePlaceOrder = async () => {
    if (!address || !currentRoundId) return;
    setTxError(null); setStep('bidding');
    
    const cost = parseFloat(amount);
    const balance = contractBalance ? parseFloat(formatEther(contractBalance)) : 0;
    if (balance < cost) {
      setTxError(`您的交易所余额 (${balance.toFixed(2)}) 不足！请先去 "Wallet" 页面从外部钱包充值。`);
      setStep('idle');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/bid`, {
        roundId: Number(currentRoundId),
        userAddress: address,
        amount: amount,
        limitPrice: limitPrice
      });
      alert("🚀 极速下单成功！");
      setStep('idle');
      const res = await axios.get(`${API_URL}/api/orders?roundId=${currentRoundId}`);
      if(res.data) setRealBids(res.data);
    } catch (e: any) {
      setTxError(e.response?.data?.error || e.message);
      setStep('idle');
    }
  };

  const currentPhase = useMemo(() => {
    if (!isRoundActive) return AuctionPhase.SETTLEMENT;
    if (timeLeft > 0) return AuctionPhase.BIDDING;
    return AuctionPhase.CLEARING;
  }, [isRoundActive, timeLeft]);

  // === UI ===
  return (
    <div className="app">
      <style>{`
        .app { min-height: 100vh; padding: 20px; font-family: 'Inter', sans-serif; background: #0b0e11; color: #e2e8f0; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; padding: 20px 0; border-bottom: 1px solid #2d3748; }
        .dashboard { display: grid; grid-template-columns: 1fr 340px; gap: 24px; margin-top: 20px; }
        .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
        .metric-card { background: #1a202c; padding: 20px; border-radius: 12px; border: 1px solid #2d3748; }
        .metric-value { font-size: 24px; font-weight: bold; color: white; margin: 5px 0; }
        .metric-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .trade-panel { background: #1a202c; padding: 24px; border-radius: 12px; border: 1px solid #2d3748; }
        .panel-title { margin-top:0; font-size: 18px; color: white; margin-bottom: 20px; }
        
        .input-group { margin-bottom: 16px; }
        .input-wrapper input { width: 100%; background: #2d3748; border: 1px solid #4a5568; color: white; padding: 12px; border-radius: 8px; font-size: 16px; box-sizing: border-box; }
        .input-label { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; margin-bottom: 6px; }
        
        .btn-primary { width: 100%; padding: 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-primary:hover { background: #2563eb; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { width: 100%; padding: 14px; background: #2d3748; color: #cbd5e1; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
        
        .orderbook { background: #1a202c; border-radius: 12px; border: 1px solid #2d3748; padding: 20px; height: 100%; }
        .orderbook-row { display: flex; justify-content: space-between; font-family: monospace; font-size: 13px; padding: 4px 0; }
        .text-green { color: #4ade80; } .text-red { color: #f87171; }
        
        .tabs { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #2d3748; }
        .tab { padding: 10px 20px; cursor: pointer; color: #94a3b8; font-weight: bold; }
        .tab.active { color: white; border-bottom: 2px solid #3b82f6; }
        
        .alert-error { background: #450a0a; color: #fca5a5; padding: 10px; border-radius: 6px; margin-bottom: 10px; font-size: 13px; }
        
        .report-card { background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin-top: 20px; }
        .report-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 14px; }
        .report-row:last-child { border-bottom: none; }
        .report-val { font-weight: bold; font-family: monospace; }
        
        .blink { animation: blink 1s infinite; }
        @keyframes blink { 50% { opacity: 0.5; } }
      `}</style>

      <div className="container">
        <header className="header">
          <div>
            <h1 style={{margin:0, fontSize:'24px', color:'white'}}>Dabanc Pro <span style={{fontSize:'12px', background:'#1e3a8a', padding:'2px 6px', borderRadius:'4px', color:'#93c5fd'}}>CEX MODE</span></h1>
            <span style={{fontSize:'12px', color:'#94a3b8'}}>Off-chain Matching • On-chain Settlement</span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
             <div style={{textAlign:'right', fontSize:'12px'}}>
                <div style={{color: networkStatus==='connected'?'#4ade80':'#fbbf24'}}>● {networkStatus==='connected'?'API Connected':'Syncing...'}</div>
                <div style={{color:'#94a3b8'}}>Updated: {new Date(lastUpdate).toLocaleTimeString()}</div>
             </div>
             <ConnectButton />
          </div>
        </header>

        {isConnected ? (
          <div className="dashboard">
            <div className="main-content">
              {/* === Metrics === */}
              <div className="metrics-row">
                <div className="metric-card">
                  <div className="metric-label">STATUS</div>
                  <div className="metric-value" style={{color: isRoundActive ? '#4ade80' : '#f87171'}}>
                    {isRoundActive ? 'TRADING' : 'SETTLED'}
                  </div>
                  <div className="metric-label">Round #{currentRoundId?.toString()}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">EST. PRICE</div>
                  <div className="metric-value">${formatters.price(estimatedPrice)}</div>
                  <div className="metric-label">Target Supply: {PROJECT_CONFIG.supplyPerRound}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">FUNDS RAISED</div>
                  <div className="metric-value">${formatters.amount(totalDemand * estimatedPrice)}</div>
                  <div className="metric-label">Demand: {formatters.amount(totalDemand)} wSPX</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">TIME LEFT</div>
                  <div className={`metric-value ${timeLeft < 60 ? 'blink' : ''}`} style={{fontFamily:'monospace'}}>
                    {formatters.countdown(timeLeft)}
                  </div>
                  <div className="metric-label">Until Settlement</div>
                </div>
              </div>

              {/* === Tabs === */}
              <div className="tabs">
                 <div className={`tab ${step !== 'depositing' && step !== 'withdrawing' && step !== 'approving' && step !== 'ready_to_deposit' ? 'active' : ''}`} onClick={() => setStep('idle')}>📈 Trade</div>
                 <div className={`tab ${step === 'depositing' || step === 'withdrawing' || step === 'approving' || step === 'ready_to_deposit' ? 'active' : ''}`} onClick={() => setStep('depositing')}>💰 Wallet / Deposit</div>
              </div>

              {step === 'depositing' || step === 'withdrawing' || step === 'approving' || step === 'ready_to_deposit' ? (
                // === Wallet Panel ===
                <div className="trade-panel" style={{border:'1px solid #fbbf24'}}>
                   <h3 className="panel-title" style={{color:'#fbbf24'}}>Fund Management (On-Chain)</h3>
                   <div style={{marginBottom:'20px', padding:'15px', background:'rgba(251, 191, 36, 0.1)', borderRadius:'8px', fontSize:'14px'}}>
                      <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px', alignItems: 'center'}}>
                         <span style={{color: '#9ca3af'}}>🦊 External Wallet (Layer 1):</span>
                         <strong>{usdcBalance ? formatters.amount(Number(formatEther(usdcBalance))) : 0} USDC</strong>
                      </div>
                      
                      {/* 资金流向箭头 */}
                      <div style={{textAlign: 'center', color: '#fbbf24', fontSize: '20px', margin: '-5px 0'}}>↓</div>

                      <div style={{display:'flex', justifyContent:'space-between', marginTop: '5px', alignItems: 'center', color:'#4ade80'}}>
                         <span>🏛️ Exchange Balance (Layer 2):</span>
                         <strong style={{fontSize: '18px'}}>{contractBalance ? formatters.amount(Number(formatEther(contractBalance))) : 0} USDC</strong>
                      </div>
                   </div>
                   
                   <div className="input-group">
                      <div className="input-label"><span>Transfer Amount</span></div>
                      <div className="input-wrapper">
                         <input type="number" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)} />
                      </div>
                   </div>

                   <div style={{display:'flex', gap:'10px'}}>
                      {/* 🌟 智能合并按钮 */}
                      <button 
                        className="btn-primary" 
                        style={{background:'#10b981'}} 
                        onClick={handleSmartDeposit} 
                        disabled={isPending}
                      >
                         {step==='approving' && isConfirming ? '⏳ Approving...' : 
                          step==='depositing' && isConfirming ? '⏳ Depositing...' :
                          needsApproval ? '🔓 Approve & Deposit' : '📥 Deposit to Exchange'}
                      </button>
                      
                      <button className="btn-secondary" style={{color:'#f87171'}} onClick={handleWithdraw} disabled={isPending}>
                         Withdraw to Wallet
                      </button>
                   </div>
                   
                   {step === 'ready_to_deposit' && (
                       <div style={{marginTop:'10px', color:'#10b981', textAlign:'center', fontSize:'13px'}}>
                           ✅ Approval Confirmed! Please click "Deposit" again to finish.
                       </div>
                   )}

                   <div style={{marginTop:'15px', textAlign:'center'}}>
                      <span style={{color:'#3b82f6', cursor:'pointer', fontSize:'12px'}} onClick={handleMint}>+ Mint Test USDC (L1)</span>
                   </div>
                </div>
              ) : currentPhase === AuctionPhase.BIDDING ? (
                // === Trading Panel ===
                <div className="trade-panel" style={{border:'1px solid #3b82f6'}}>
                   <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                      <h3 className="panel-title" style={{color:'#60a5fa', margin:0}}>Lightning Order</h3>
                      <div style={{fontSize:'12px', background:'#1e40af', padding:'4px 8px', borderRadius:'4px', color:'white'}}>
                         Available Balance: {contractBalance ? formatters.amount(Number(formatEther(contractBalance))) : 0} USDC
                      </div>
                   </div>

                   <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                      <div className="input-group">
                         <div className="input-label"><span>Bid Amount (USDC)</span></div>
                         <div className="input-wrapper">
                            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} />
                         </div>
                      </div>
                      <div className="input-group">
                         <div className="input-label"><span>Limit Price ($)</span></div>
                         <div className="input-wrapper">
                            <input type="number" value={limitPrice} onChange={e=>setLimitPrice(e.target.value)} />
                         </div>
                      </div>
                   </div>

                   {/* Simulator */}
                   {userEstimate && (
                      <div style={{background:'#1e293b', padding:'15px', borderRadius:'8px', marginBottom:'20px', fontSize:'13px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px'}}>
                            <span>Prediction:</span>
                            <span style={{fontWeight:'bold', color: userEstimate.wouldMatch ? '#4ade80':'#f87171'}}>
                               {userEstimate.wouldMatch ? '✅ MATCHED' : '❌ OUT'}
                            </span>
                         </div>
                         <div style={{display:'flex', justifyContent:'space-between'}}>
                            <span>Est. Tokens:</span>
                            <span style={{fontFamily:'monospace'}}>{formatters.amount(userEstimate.estimatedTokens)} wSPX</span>
                         </div>
                      </div>
                   )}

                   {txError && <div className="alert-error">{txError}</div>}

                   <button className="btn-primary" onClick={handlePlaceOrder} disabled={!isWhitelisted}>
                      🚀 Place Instant Order
                   </button>
                   <div style={{textAlign:'center', marginTop:'10px', fontSize:'12px', color:'#64748b'}}>
                      No Gas • No Signature • Instant Matching
                   </div>
                </div>
              ) : (
                // === Settlement Panel ===
                <div className="trade-panel" style={{textAlign:'center', padding:'40px'}}>
                   <div style={{fontSize:'40px', marginBottom:'10px'}}>🎉</div>
                   <h2 style={{color:'#4ade80'}}>Round Settled</h2>
                   <p style={{color:'#94a3b8'}}>Final Clearing Price: <strong style={{color:'white', fontSize:'24px'}}>${roundData ? formatters.price(Number(formatEther(roundData[1]))) : '...'}</strong></p>
                   
                   {/* 结算报告卡片 */}
                   {settlementReport ? (
                       <div className="report-card">
                           <h4 style={{margin:'0 0 10px 0', color:'#10b981'}}>📊 My Performance (Round #{settlementRoundId?.toString()})</h4>
                           <div className="report-row">
                               <span>Total Bid:</span>
                               <span className="report-val">{formatters.amount(settlementReport.totalBid)} USDC</span>
                           </div>
                           <div className="report-row">
                               <span>Actual Cost:</span>
                               <span className="report-val">{formatters.amount(settlementReport.actualCost)} USDC</span>
                           </div>
                           <div className="report-row">
                               <span style={{color:'#4ade80'}}>Tokens Received:</span>
                               <span className="report-val" style={{color:'#4ade80'}}>{formatters.amount(settlementReport.tokensAllocated)} wSPX</span>
                           </div>
                           {settlementReport.refundAmount > 0 && (
                               <div className="report-row">
                                   <span style={{color:'#fbbf24'}}>Refund:</span>
                                   <span className="report-val" style={{color:'#fbbf24'}}>{formatters.amount(settlementReport.refundAmount)} USDC</span>
                               </div>
                           )}
                           
                           <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                               {!settlementReport.hasClaimed && settlementReport.tokensAllocated > 0 && (
                                   <button className="btn-secondary" onClick={handleClaimTokens} disabled={isPending}>🎁 Claim Tokens</button>
                               )}
                               {!settlementReport.hasRefunded && settlementReport.refundAmount > 0 && (
                                   <button className="btn-secondary" onClick={handleClaimRefund} disabled={isPending}>💸 Claim Refund</button>
                               )}
                           </div>
                       </div>
                   ) : (
                       <div style={{marginTop:'20px', color:'#64748b'}}>
                           <p>You did not participate in this round.</p>
                       </div>
                   )}
                </div>
              )}
            </div>

            {/* === Sidebar === */}
            <div className="sidebar">
               <div className="orderbook">
                  <h3 style={{marginTop:0, borderBottom:'1px solid #2d3748', paddingBottom:'10px', fontSize:'14px', color:'#94a3b8'}}>REAL-TIME ORDERBOOK</h3>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#64748b', marginBottom:'10px'}}>
                     <span>Price ($)</span>
                     <span>Vol (USDC)</span>
                  </div>
                  <div style={{display:'flex', flexDirection:'column', gap:'5px', overflowY:'auto', maxHeight:'500px'}}>
                     {orderBookDisplay.length === 0 && <div style={{textAlign:'center', color:'#475569', marginTop:'20px'}}>Waiting for bids...</div>}
                     {orderBookDisplay.map((order, i) => (
                        <div key={i} className="orderbook-row" style={{opacity: order.isMatched ? 1 : 0.4}}>
                           <span className={order.isMatched ? 'text-green' : 'text-red'}>
                              ${formatters.price(order.price)} {order.isMarginal && '🎯'}
                           </span>
                           <span style={{color:'white'}}>{formatters.amount(order.volume)}</span>
                        </div>
                     ))}
                  </div>
                  
                  <div style={{marginTop:'20px', borderTop:'1px solid #2d3748', paddingTop:'20px'}}>
                     <h3 style={{marginTop:0, fontSize:'14px', color:'#94a3b8'}}>MARKET DEPTH</h3>
                     <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                        {depthData.slice(0, 5).map((d, i) => {
                           const maxVol = Math.max(...depthData.map(x=>x.volume));
                           const percent = (d.volume / maxVol) * 100;
                           return (
                              <div key={i} style={{display:'flex', alignItems:'center', fontSize:'11px', gap:'10px'}}>
                                 <span style={{width:'40px', textAlign:'right'}}>${d.price}</span>
                                 <div style={{flex:1, background:'#334155', height:'6px', borderRadius:'3px', overflow:'hidden'}}>
                                    <div style={{width:`${percent}%`, background:'#3b82f6', height:'100%'}}></div>
                                 </div>
                                 <span style={{width:'50px'}}>{formatters.amount(d.volume)}</span>
                              </div>
                           )
                        })}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        ) : (
          <div style={{textAlign:'center', marginTop:'100px'}}>
             <h2>Please connect wallet to trade</h2>
             <ConnectButton />
          </div>
        )}
      </div>
    </div>
  );
}