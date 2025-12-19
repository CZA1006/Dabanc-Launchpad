/**
 * Dabanc Launchpad - 仪表盘风格前端
 * 设计理念：让用户对资金流向有掌控感
 */

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { 
  useAccount, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt, 
  usePublicClient,
  useWatchContractEvent,
  useChainId
} from 'wagmi';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { parseEther, formatEther } from 'viem';
import { 
  AUCTION_ADDRESS, 
  USDC_ADDRESS, 
  AUCTION_ABI, 
  USDC_ABI, 
  PROJECT_CONFIG,
  AuctionPhase,
  formatters,
  getFriendlyError
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

interface UserPosition {
  totalBid: number;
  tokensAllocated: number;
  refundAmount: number;
  hasClaimed: boolean;
  hasRefunded: boolean;
}

// === 主应用组件 ===
export default function App() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  
  // 网络名称映射
  const networkName = chainId === 11155111 ? 'Sepolia' : chainId === 31337 ? 'Anvil' : `Chain ${chainId}`;
  
  // === 状态管理 ===
  const [amount, setAmount] = useState('500');
  const [limitPrice, setLimitPrice] = useState('12.00');
  const [timeLeft, setTimeLeft] = useState(0);
  const [realBids, setRealBids] = useState<Bid[]>([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'syncing' | 'error'>('connected');
  const [txError, setTxError] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'approving' | 'bidding'>('idle');
  
  // 乐观更新状态
  const [pendingBid, setPendingBid] = useState<Bid | null>(null);
  
  const { writeContract, data: hash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // === 链上数据读取 ===
  const { data: isRoundActive, refetch: refetchActive } = useReadContract({
    address: AUCTION_ADDRESS, 
    abi: AUCTION_ABI, 
    functionName: 'isRoundActive',
    query: { refetchInterval: 2000 }
  });

  const { data: currentRoundId, refetch: refetchRoundId } = useReadContract({
    address: AUCTION_ADDRESS, 
    abi: AUCTION_ABI, 
    functionName: 'currentRoundId',
    query: { refetchInterval: 2000 }
  });

  const { data: lastClearingTime } = useReadContract({
    address: AUCTION_ADDRESS, 
    abi: AUCTION_ABI, 
    functionName: 'lastClearingTime',
    query: { refetchInterval: 2000 }
  });

  const { data: roundData } = useReadContract({
    address: AUCTION_ADDRESS, 
    abi: AUCTION_ABI, 
    functionName: 'rounds',
    args: currentRoundId ? [currentRoundId] : undefined,
    query: { refetchInterval: 3000 }
  });

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS, 
    abi: USDC_ABI, 
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { refetchInterval: 5000 }
  });

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, 
    abi: USDC_ABI, 
    functionName: 'allowance',
    args: address ? [address, AUCTION_ADDRESS] : undefined,
    query: { refetchInterval: 3000 }
  });

  const { data: userBidAmount } = useReadContract({
    address: AUCTION_ADDRESS,
    abi: AUCTION_ABI,
    functionName: 'userBids',
    args: currentRoundId && address ? [currentRoundId, address] : undefined,
    query: { refetchInterval: 3000 }
  });

  const { data: isWhitelisted } = useReadContract({
    address: AUCTION_ADDRESS,
    abi: AUCTION_ABI,
    functionName: 'isWhitelisted',
    args: address ? [address] : undefined,
  });

  // === 用户历史轮次分配信息 ===
  // 获取上一轮的分配结果（如果已清算）
  const previousRoundId = currentRoundId && Number(currentRoundId) > 1 ? Number(currentRoundId) - 1 : 0;
  
  const { data: previousRoundInfo } = useReadContract({
    address: AUCTION_ADDRESS,
    abi: AUCTION_ABI,
    functionName: 'rounds',
    args: previousRoundId ? [BigInt(previousRoundId)] : undefined,
    query: { refetchInterval: 5000 }
  });

  const { data: userPreviousRoundDetails, refetch: refetchUserDetails } = useReadContract({
    address: AUCTION_ADDRESS,
    abi: AUCTION_ABI,
    functionName: 'getUserBidDetails',
    args: previousRoundId && address ? [BigInt(previousRoundId), address] : undefined,
    query: { refetchInterval: 5000 }
  });

  // 解析用户分配信息
  const userSettlement = useMemo(() => {
    if (!userPreviousRoundDetails || !previousRoundInfo) return null;
    
    const [totalAmount, tokensAllocated, refundAmount, hasClaimed, hasRefunded] = userPreviousRoundDetails as [bigint, bigint, bigint, boolean, boolean];
    const [_, clearingPrice, __, isCleared] = previousRoundInfo as [bigint, bigint, bigint, boolean];
    
    if (!isCleared || totalAmount === BigInt(0)) return null;
    
    const totalBid = Number(formatEther(totalAmount));
    const tokens = Number(formatEther(tokensAllocated));
    const refund = Number(formatEther(refundAmount));
    const price = Number(formatEther(clearingPrice));
    const actualPaid = totalBid - refund;
    
    return {
      roundId: previousRoundId,
      totalBid,
      tokensAllocated: tokens,
      refundAmount: refund,
      actualPaid,
      clearingPrice: price,
      hasClaimed,
      hasRefunded
    };
  }, [userPreviousRoundDetails, previousRoundInfo, previousRoundId]);

  // === 领取代币和退款函数 ===
  const handleClaimTokens = () => {
    if (!userSettlement) return;
    writeContract({
      address: AUCTION_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'claimTokens',
      args: [BigInt(userSettlement.roundId)]
    });
  };

  const handleClaimRefund = () => {
    if (!userSettlement) return;
    writeContract({
      address: AUCTION_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'claimRefund',
      args: [BigInt(userSettlement.roundId)]
    });
  };

  // === 事件监听 (实时更新) ===
  useWatchContractEvent({
    address: AUCTION_ADDRESS,
    abi: AUCTION_ABI,
    eventName: 'BidPlaced',
    onLogs(logs) {
      logs.forEach(log => {
        const args = log.args as any;
        if (args && Number(args.roundId) === Number(currentRoundId)) {
          const newBid: Bid = {
            user: args.user,
            amount: Number(formatEther(args.amount)),
            limitPrice: Number(formatEther(args.limitPrice)),
            timestamp: Date.now(),
            txHash: log.transactionHash,
            status: 'confirmed'
          };
          
          setRealBids(prev => {
            // 去重 + 移除乐观更新
            const filtered = prev.filter(b => 
              b.txHash !== log.transactionHash && b.status !== 'pending'
            );
            return [...filtered, newBid].sort((a, b) => b.limitPrice - a.limitPrice);
          });
          
          setPendingBid(null);
          setLastUpdate(Date.now());
        }
      });
    }
  });

  // === 历史数据加载 ===
  const fetchLogs = useCallback(async () => {
    if (!currentRoundId || !publicClient) return;
    
    setNetworkStatus('syncing');
    
    try {
      const latestBlock = await publicClient.getBlockNumber();
      // 扩大搜索范围：最近 5000 个区块（约 16 小时）
      const startBlock = latestBlock > 5000n ? latestBlock - 5000n : 0n;

      const logs = await publicClient.getContractEvents({
        address: AUCTION_ADDRESS, 
        abi: AUCTION_ABI, 
        eventName: 'BidPlaced',
        args: { roundId: currentRoundId },
        fromBlock: startBlock, 
        toBlock: 'latest'
      });

      const newBids: Bid[] = logs.map((log) => {
        const args = log.args as any;
        return {
          user: args.user,
          amount: Number(formatEther(args.amount)),
          limitPrice: Number(formatEther(args.limitPrice)),
          timestamp: Date.now(),
          txHash: log.transactionHash,
          status: 'confirmed' as const
        };
      });

      setRealBids(prev => {
        const existingHashes = new Set(prev.filter(b => b.status === 'confirmed').map(b => b.txHash));
        const uniqueNewBids = newBids.filter(b => !existingHashes.has(b.txHash));
        const pendingBids = prev.filter(b => b.status === 'pending');
        return [...pendingBids, ...prev.filter(b => b.status === 'confirmed'), ...uniqueNewBids]
          .sort((a, b) => b.limitPrice - a.limitPrice);
      });
      
      setNetworkStatus('connected');
      setLastUpdate(Date.now());
    } catch (e) { 
      console.error("Fetch Error:", e);
      setNetworkStatus('error');
    }
  }, [currentRoundId, publicClient]);

  // 初始化加载
  useEffect(() => {
    fetchLogs();
  }, [currentRoundId, fetchLogs]);

  // 轮询刷新
  useEffect(() => {
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // 换轮次清空
  useEffect(() => {
    if (currentRoundId) {
      setRealBids([]);
      setPendingBid(null);
    }
  }, [currentRoundId]);

  // === 倒计时逻辑 ===
  useEffect(() => {
    const timer = setInterval(() => {
      if (isRoundActive && lastClearingTime) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - Number(lastClearingTime);
        const remaining = PROJECT_CONFIG.roundDuration - elapsed;
        setTimeLeft(remaining > 0 ? remaining : 0);
      } else {
        setTimeLeft(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isRoundActive, lastClearingTime]);

  // === 交易确认处理 ===
  useEffect(() => {
    if (isConfirmed) {
      refetchActive();
      refetchRoundId();
      refetchBalance();
      refetchAllowance();
      reset();
      setStep('idle');
      setTxError(null);
    }
  }, [isConfirmed]);

  // === 错误处理 ===
  useEffect(() => {
    if (writeError) {
      setTxError(getFriendlyError(writeError));
      setStep('idle');
      setPendingBid(null);
    }
  }, [writeError]);

  // === 撮合引擎计算 ===
  const { 
    estimatedPrice, 
    totalDemand,
    orderBookDisplay,
    depthData,
    userEstimate
  } = useMemo(() => {
    const allBids = pendingBid 
      ? [...realBids, pendingBid]
      : realBids;
    
    if (allBids.length === 0) {
      return { 
        estimatedPrice: 1.0,
        totalDemand: 0,
        orderBookDisplay: [],
        depthData: [],
        userEstimate: null
      };
    }
    
    const sortedBids = [...allBids].sort((a, b) => b.limitPrice - a.limitPrice);
    const SUPPLY = PROJECT_CONFIG.supplyPerRound;
    
    let accumulated = 0;
    let clearingPrice = 1.0;
    let clearingIndex = -1;

    // 计算清算价格
    for (let i = 0; i < sortedBids.length; i++) {
      const bid = sortedBids[i];
      const tokensWanted = bid.amount / bid.limitPrice;
      accumulated += tokensWanted;
      
      if (accumulated >= SUPPLY && clearingIndex === -1) {
        clearingPrice = bid.limitPrice;
        clearingIndex = i;
      }
    }
    
    if (accumulated < SUPPLY && sortedBids.length > 0) {
      clearingPrice = sortedBids[sortedBids.length - 1].limitPrice;
    }

    // 订单簿展示
    const display = sortedBids.slice(0, 10).map((b, i) => ({
      price: b.limitPrice,
      volume: b.amount,
      tokensWanted: b.amount / b.limitPrice,
      user: b.user,
      isMatched: b.limitPrice >= clearingPrice,
      isMarginal: clearingIndex === i,
      isPending: b.status === 'pending'
    }));

    // 深度数据 (用于深度图)
    const priceGroups: { [key: string]: number } = {};
    sortedBids.forEach(b => {
      const priceKey = Math.floor(b.limitPrice).toString();
      priceGroups[priceKey] = (priceGroups[priceKey] || 0) + b.amount;
    });
    
    const depth = Object.entries(priceGroups)
      .map(([price, volume]) => ({ price: parseFloat(price), volume }))
      .sort((a, b) => b.price - a.price);

    // 用户模拟计算
    let userEst = null;
    if (amount && limitPrice) {
      const inputAmount = parseFloat(amount);
      const inputPrice = parseFloat(limitPrice);
      if (!isNaN(inputAmount) && !isNaN(inputPrice) && inputPrice > 0) {
        const wouldMatch = inputPrice >= clearingPrice;
        const tokensWouldGet = wouldMatch ? inputAmount / clearingPrice : 0;
        const refund = wouldMatch ? 0 : inputAmount;
        userEst = {
          wouldMatch,
          estimatedTokens: tokensWouldGet,
          refund,
          currentClearingPrice: clearingPrice
        };
      }
    }

    return { 
      estimatedPrice: clearingPrice,
      totalDemand: accumulated,
      orderBookDisplay: display,
      depthData: depth,
      userEstimate: userEst
    };
  }, [realBids, pendingBid, amount, limitPrice]);

  // === 计算当前阶段 ===
  const currentPhase = useMemo((): AuctionPhase => {
    if (!currentRoundId || Number(currentRoundId) === 0) return AuctionPhase.PREVIEW;
    if (isRoundActive && timeLeft > 0) return AuctionPhase.BIDDING;
    if (isRoundActive && timeLeft <= 0) return AuctionPhase.CLEARING;
    return AuctionPhase.SETTLEMENT;
  }, [currentRoundId, isRoundActive, timeLeft]);

  // === 交易处理函数 ===
  const handleApprove = async () => {
    setTxError(null);
    setStep('approving');
    try {
      writeContract({
        address: USDC_ADDRESS, 
        abi: USDC_ABI, 
        functionName: 'approve',
        args: [AUCTION_ADDRESS, parseEther(amount)]
      });
    } catch (e) {
      setTxError(getFriendlyError(e));
      setStep('idle');
    }
  };

  const handleBid = async () => {
    setTxError(null);
    setStep('bidding');
    
    // 乐观更新
    const optimisticBid: Bid = {
      user: address!,
      amount: parseFloat(amount),
      limitPrice: parseFloat(limitPrice),
      timestamp: Date.now(),
      txHash: `pending-${Date.now()}`,
      status: 'pending'
    };
    setPendingBid(optimisticBid);
    
    try {
      writeContract({
        address: AUCTION_ADDRESS, 
        abi: AUCTION_ABI, 
        functionName: 'placeBid',
        args: [parseEther(amount), parseEther(limitPrice)]
      });
    } catch (e) {
      setTxError(getFriendlyError(e));
      setStep('idle');
      setPendingBid(null);
    }
  };

  const handleMint = () => {
    writeContract({
      address: USDC_ADDRESS, 
      abi: USDC_ABI, 
      functionName: 'mint',
      args: [address!, parseEther('10000')]
    });
  };

  const handleStartNext = () => {
    writeContract({
      address: AUCTION_ADDRESS, 
      abi: AUCTION_ABI, 
      functionName: 'startNextRound'
    });
  };

  // === 辅助计算 ===
  const needsApproval = useMemo(() => {
    if (!usdcAllowance || !amount) return true;
    try {
      return Number(formatEther(usdcAllowance)) < parseFloat(amount);
    } catch {
      return true;
    }
  }, [usdcAllowance, amount]);

  const canBid = useMemo(() => {
    if (!amount || !limitPrice) return false;
    const amtNum = parseFloat(amount);
    const priceNum = parseFloat(limitPrice);
    const balanceNum = usdcBalance ? Number(formatEther(usdcBalance)) : 0;
    return amtNum > 0 && priceNum > 0 && amtNum <= balanceNum && !needsApproval;
  }, [amount, limitPrice, usdcBalance, needsApproval]);

  // 价格警告
  const priceWarning = useMemo(() => {
    const price = parseFloat(limitPrice);
    if (isNaN(price)) return null;
    if (price > estimatedPrice * 1.5) return '您的出价远高于当前预计清算价，可能导致多支付资金';
    if (price < estimatedPrice * 0.5) return '您的出价较低，可能无法成交';
    return null;
  }, [limitPrice, estimatedPrice]);

  // === 渲染 ===
  return (
    <div className="app">
      <style>{`
        .app {
          min-height: 100vh;
          padding: 20px;
        }
        
        .container {
          max-width: 1400px;
          margin: 0 auto;
        }
        
        /* === 顶部导航 === */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 24px;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .logo-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--accent-cyan), var(--accent-green));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }
        
        .logo-text h1 {
          font-family: var(--font-display);
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(90deg, var(--text-primary), var(--accent-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .logo-text span {
          font-size: 11px;
          color: var(--text-muted);
        }
        
        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .network-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-muted);
        }
        
        .network-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .network-dot.connected { background: var(--accent-green); }
        .network-dot.syncing { background: var(--accent-yellow); animation: pulse 1s infinite; }
        .network-dot.error { background: var(--accent-red); }
        
        /* === 阶段指示器 === */
        .phase-indicator {
          display: flex;
          gap: 4px;
          padding: 20px 0;
          margin-bottom: 24px;
        }
        
        .phase-step {
          flex: 1;
          position: relative;
        }
        
        .phase-bar {
          height: 4px;
          background: var(--bg-input);
          border-radius: 2px;
          overflow: hidden;
        }
        
        .phase-bar-fill {
          height: 100%;
          background: var(--accent-cyan);
          transition: width 0.3s ease;
        }
        
        .phase-bar.active .phase-bar-fill {
          background: var(--accent-green);
          animation: pulse 1.5s infinite;
        }
        
        .phase-bar.completed .phase-bar-fill {
          width: 100% !important;
          background: var(--accent-cyan);
        }
        
        .phase-label {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          font-size: 12px;
          color: var(--text-muted);
        }
        
        .phase-label.active {
          color: var(--accent-green);
        }
        
        .phase-label.completed {
          color: var(--accent-cyan);
        }
        
        /* === 主布局 === */
        .dashboard {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
        }
        
        @media (max-width: 1024px) {
          .dashboard {
            grid-template-columns: 1fr;
          }
        }
        
        .main-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        /* === 指标卡片行 === */
        .metrics-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        
        @media (max-width: 768px) {
          .metrics-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        .metric-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 20px;
          transition: all var(--transition-normal);
        }
        
        .metric-card:hover {
          border-color: var(--border-color);
        }
        
        .metric-card.highlight {
          border-color: var(--accent-cyan);
          box-shadow: 0 0 30px rgba(0, 212, 255, 0.1);
        }
        
        .metric-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        
        .metric-value {
          font-family: var(--font-mono);
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }
        
        .metric-value.green { color: var(--accent-green); }
        .metric-value.cyan { color: var(--accent-cyan); }
        .metric-value.yellow { color: var(--accent-yellow); }
        
        .metric-sub {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 4px;
        }
        
        /* === 交易面板 === */
        .trade-panel {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 24px;
        }
        
        .trade-panel.disabled {
          opacity: 0.6;
          pointer-events: none;
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .panel-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .input-group {
          margin-bottom: 16px;
        }
        
        .input-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .input-label span {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .input-label .balance {
          color: var(--text-secondary);
          cursor: pointer;
        }
        
        .input-label .balance:hover {
          color: var(--accent-cyan);
        }
        
        .input-wrapper {
          position: relative;
        }
        
        .input-wrapper input {
          width: 100%;
          padding: 16px;
          padding-right: 70px;
          font-family: var(--font-mono);
          font-size: 20px;
          font-weight: 600;
          background: var(--bg-input);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          outline: none;
          transition: all var(--transition-fast);
        }
        
        .input-wrapper input:focus {
          border-color: var(--accent-cyan);
          box-shadow: 0 0 0 3px var(--accent-cyan-dim);
        }
        
        .input-wrapper input.warning {
          border-color: var(--accent-yellow);
        }
        
        .input-suffix {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
        }
        
        .warning-text {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 10px 12px;
          background: var(--accent-yellow-dim);
          border-radius: var(--radius-sm);
          font-size: 12px;
          color: var(--accent-yellow);
        }
        
        .error-text {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 12px;
          padding: 12px;
          background: var(--accent-red-dim);
          border-radius: var(--radius-sm);
          font-size: 13px;
          color: var(--accent-red);
        }
        
        /* === 模拟计算器 === */
        .simulator {
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
          padding: 16px;
          margin: 16px 0;
        }
        
        .simulator-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .simulator-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .simulator-row:last-child {
          border-bottom: none;
        }
        
        .simulator-label {
          font-size: 13px;
          color: var(--text-secondary);
        }
        
        .simulator-value {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 600;
        }
        
        .simulator-value.success {
          color: var(--accent-green);
        }
        
        .simulator-value.fail {
          color: var(--accent-red);
        }
        
        /* === 按钮组 === */
        .button-group {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }
        
        .btn-trade {
          flex: 1;
          padding: 16px 24px;
          font-family: var(--font-body);
          font-size: 15px;
          font-weight: 600;
          border-radius: var(--radius-md);
          border: none;
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .btn-trade:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .btn-approve {
          background: var(--bg-input);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }
        
        .btn-approve:hover:not(:disabled) {
          border-color: var(--accent-cyan);
        }
        
        .btn-submit {
          background: linear-gradient(135deg, var(--accent-cyan), #0099cc);
          color: #000;
          box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
        }
        
        .btn-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(0, 212, 255, 0.4);
        }
        
        .btn-submit.loading {
          background: var(--bg-input);
          color: var(--text-secondary);
        }
        
        /* === 侧边栏 === */
        .sidebar {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        /* === 订单簿 === */
        .orderbook {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 20px;
        }
        
        .orderbook-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .orderbook-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .orderbook-legend {
          display: flex;
          gap: 12px;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-muted);
        }
        
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .legend-dot.matched { background: var(--accent-green); }
        .legend-dot.unmatched { background: var(--accent-red); opacity: 0.5; }
        
        .orderbook-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          margin-bottom: 4px;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 13px;
          transition: background var(--transition-fast);
        }
        
        .orderbook-row.matched {
          background: var(--accent-green-dim);
        }
        
        .orderbook-row.unmatched {
          background: transparent;
          opacity: 0.5;
        }
        
        .orderbook-row.marginal {
          background: var(--accent-cyan-dim);
          border: 1px solid var(--accent-cyan);
        }
        
        .orderbook-row.pending {
          background: var(--accent-yellow-dim);
          border: 1px dashed var(--accent-yellow);
        }
        
        .orderbook-price {
          font-weight: 600;
        }
        
        .orderbook-price.green { color: var(--accent-green); }
        .orderbook-price.red { color: var(--accent-red); }
        
        .orderbook-volume {
          color: var(--text-secondary);
        }
        
        .orderbook-user {
          font-size: 11px;
          color: var(--text-muted);
        }
        
        .orderbook-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
          font-size: 14px;
        }
        
        /* === 深度图 === */
        .depth-chart {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 20px;
        }
        
        .depth-chart-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .depth-bars {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .depth-bar {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .depth-price {
          width: 50px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-muted);
        }
        
        .depth-bar-container {
          flex: 1;
          height: 20px;
          background: var(--bg-input);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        
        .depth-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-cyan-dim), var(--accent-cyan));
          border-radius: var(--radius-sm);
          transition: width 0.3s ease;
        }
        
        .depth-volume {
          width: 80px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-secondary);
          text-align: right;
        }
        
        /* === 资产面板 === */
        .assets-panel {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 20px;
        }
        
        .assets-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .asset-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        
        .asset-row:last-child {
          border-bottom: none;
        }
        
        .asset-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .asset-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
        }
        
        .asset-icon.usdc {
          background: linear-gradient(135deg, #2775ca, #1a5cad);
          color: white;
        }
        
        .asset-icon.wspx {
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          color: white;
        }
        
        .asset-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .asset-symbol {
          font-size: 12px;
          color: var(--text-muted);
        }
        
        .asset-balance {
          text-align: right;
        }
        
        .asset-amount {
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .asset-usd {
          font-size: 12px;
          color: var(--text-muted);
        }
        
        .mint-btn {
          margin-top: 12px;
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 1px dashed var(--border-color);
          border-radius: var(--radius-md);
          color: var(--accent-cyan);
          font-size: 13px;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        
        .mint-btn:hover {
          background: var(--accent-cyan-dim);
          border-color: var(--accent-cyan);
        }
        
        /* === 结算面板 === */
        .settlement-panel {
          background: linear-gradient(135deg, rgba(0, 255, 136, 0.1), rgba(0, 212, 255, 0.1));
          border: 1px solid var(--accent-green);
          border-radius: var(--radius-lg);
          padding: 32px;
          text-align: center;
        }
        
        .settlement-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        
        .settlement-title {
          font-family: var(--font-display);
          font-size: 24px;
          font-weight: 700;
          color: var(--accent-green);
          margin-bottom: 8px;
        }
        
        .settlement-price {
          font-family: var(--font-mono);
          font-size: 36px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 16px 0;
        }
        
        .settlement-info {
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 24px;
        }
        
        /* 新结算结果面板样式 */
        .settlement-result {
          text-align: left;
        }
        
        .settlement-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 14px;
        }
        
        .settlement-row:last-of-type {
          border-bottom: none;
        }
        
        .settlement-row.highlight {
          background: rgba(0, 255, 136, 0.05);
          margin: 0 -12px;
          padding: 10px 12px;
          border-radius: 6px;
        }
        
        .settlement-row .success {
          color: var(--accent-green);
          font-weight: 600;
        }
        
        .settlement-row .warning {
          color: var(--accent-yellow);
          font-weight: 600;
        }
        
        .settlement-actions {
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .claim-btn {
          width: 100%;
          padding: 14px 20px;
          border-radius: var(--radius-md);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        
        .claim-btn.primary {
          background: linear-gradient(135deg, var(--accent-green), var(--accent-cyan));
          color: #000;
          border: none;
        }
        
        .claim-btn.primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow-green);
        }
        
        .claim-btn.secondary {
          background: transparent;
          color: var(--accent-yellow);
          border: 1px solid var(--accent-yellow);
        }
        
        .claim-btn.secondary:hover:not(:disabled) {
          background: rgba(255, 193, 7, 0.1);
        }
        
        .claim-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .claim-status {
          text-align: center;
          padding: 10px;
          border-radius: var(--radius-md);
          font-size: 13px;
        }
        
        .claim-status.success {
          background: rgba(0, 255, 136, 0.1);
          color: var(--accent-green);
        }
        
        .btn-next-round {
          padding: 16px 32px;
          background: var(--accent-green);
          color: #000;
          border: none;
          border-radius: var(--radius-md);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        
        .btn-next-round:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow-green);
        }
        
        /* === 未连接状态 === */
        .connect-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
        }
        
        .connect-icon {
          font-size: 64px;
          margin-bottom: 24px;
        }
        
        .connect-title {
          font-family: var(--font-display);
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 12px;
        }
        
        .connect-desc {
          font-size: 16px;
          color: var(--text-secondary);
          max-width: 400px;
          margin-bottom: 32px;
        }
        
        /* === 链接区 === */
        .links-bar {
          display: flex;
          gap: 16px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid var(--border-subtle);
        }
        
        .link-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-muted);
          cursor: pointer;
          transition: color var(--transition-fast);
        }
        
        .link-item:hover {
          color: var(--accent-cyan);
        }
        
        /* === 数据更新时间 === */
        .update-time {
          font-size: 11px;
          color: var(--text-dim);
          text-align: right;
          margin-top: 8px;
        }
      `}</style>

      <div className="container">
        {/* === 顶部导航 === */}
        <header className="header">
          <div className="logo">
            <div className="logo-icon">🚀</div>
            <div className="logo-text">
              <h1>DABANC Launchpad</h1>
              <span>Decentralized Batch Auction Protocol</span>
            </div>
          </div>
          
          <div className="header-right">
            <div className="network-status">
              <div className={`network-dot ${networkStatus}`}></div>
              <span>{networkName}</span>
              {chainId !== 11155111 && <span style={{color: 'var(--accent-yellow)'}}>⚠️ 请切换到 Sepolia</span>}
              <span>•</span>
              <span>更新于 {formatters.relativeTime(lastUpdate)}</span>
            </div>
            <ConnectButton />
          </div>
        </header>

        {/* === 阶段指示器 === */}
        <div className="phase-indicator">
          {[
            { phase: AuctionPhase.PREVIEW, label: '预热期', icon: '📋' },
            { phase: AuctionPhase.BIDDING, label: '竞拍期', icon: '⚡' },
            { phase: AuctionPhase.CLEARING, label: '清算期', icon: '🔄' },
            { phase: AuctionPhase.SETTLEMENT, label: '结算期', icon: '✅' },
          ].map((item, index) => {
            const phases = [AuctionPhase.PREVIEW, AuctionPhase.BIDDING, AuctionPhase.CLEARING, AuctionPhase.SETTLEMENT];
            const currentIndex = phases.indexOf(currentPhase);
            const isActive = item.phase === currentPhase;
            const isCompleted = index < currentIndex;
            
            let fillWidth = '0%';
            if (isCompleted) fillWidth = '100%';
            if (isActive && currentPhase === AuctionPhase.BIDDING && timeLeft > 0) {
              fillWidth = `${((PROJECT_CONFIG.roundDuration - timeLeft) / PROJECT_CONFIG.roundDuration) * 100}%`;
            }
            if (isActive && currentPhase !== AuctionPhase.BIDDING) fillWidth = '50%';
            
            return (
              <div key={item.phase} className="phase-step">
                <div className={`phase-bar ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div className="phase-bar-fill" style={{ width: fillWidth }}></div>
                </div>
                <div className={`phase-label ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {isConnected ? (
          <div className="dashboard">
            <div className="main-content">
              {/* === 指标卡片 === */}
              <div className="metrics-row">
                <div className={`metric-card ${isRoundActive ? 'highlight' : ''}`}>
                  <div className="metric-label">轮次状态</div>
                  <div className={`metric-value ${isRoundActive ? 'green' : 'cyan'}`}>
                    {isRoundActive ? `LIVE #${currentRoundId?.toString()}` : 'SETTLED'}
                  </div>
                  <div className="metric-sub">
                    {isRoundActive && <span className="badge badge-live">进行中</span>}
                    {!isRoundActive && <span className="badge badge-settled">已结算</span>}
                  </div>
                </div>
                
                <div className="metric-card">
                  <div className="metric-label">倒计时</div>
                  <div className={`metric-value ${timeLeft < 60 ? 'yellow' : ''}`}>
                    {formatters.countdown(timeLeft)}
                  </div>
                  <div className="metric-sub">
                    {timeLeft > 0 ? '剩余竞拍时间' : '等待清算'}
                  </div>
                </div>
                
                <div className="metric-card highlight">
                  <div className="metric-label">
                    {roundData && roundData[3] ? '链上清算价' : '预计清算价'}
                  </div>
                  <div className="metric-value cyan">
                    ${roundData && roundData[3] && roundData[1] > 0n
                      ? formatters.price(Number(formatEther(roundData[1])))
                      : formatters.price(estimatedPrice)}
                  </div>
                  <div className="metric-sub">
                    {roundData && roundData[3] 
                      ? '✅ 已清算' 
                      : `基于 ${realBids.length} 笔链上出价`}
                  </div>
                </div>
                
                <div className="metric-card">
                  <div className="metric-label">本轮募资</div>
                  <div className="metric-value">
                    ${roundData ? formatters.amount(Number(formatEther(roundData[0]))) : '0'}
                  </div>
                  <div className="metric-sub">
                    需求/供应: {formatters.amount(totalDemand)}/{PROJECT_CONFIG.supplyPerRound}
                  </div>
                </div>
              </div>

              {/* === 交易面板 / 结算面板 === */}
              {currentPhase === AuctionPhase.BIDDING ? (
                <div className="trade-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">💹 提交限价订单</h3>
                    {isWhitelisted && <span className="badge badge-live">✓ KYC 已验证</span>}
                    {!isWhitelisted && <span className="badge badge-error">未通过 KYC</span>}
                  </div>

                  <div className="input-group">
                    <div className="input-label">
                      <span>出价金额</span>
                      <span 
                        className="balance"
                        onClick={() => usdcBalance && setAmount(formatEther(usdcBalance))}
                      >
                        余额: {usdcBalance ? formatters.amount(Number(formatEther(usdcBalance))) : '0'} USDC
                      </span>
                    </div>
                    <div className="input-wrapper">
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                      />
                      <span className="input-suffix">USDC</span>
                    </div>
                  </div>

                  <div className="input-group">
                    <div className="input-label">
                      <span>限价 (心理价位)</span>
                      <span className="balance">
                        当前预估: ${formatters.price(estimatedPrice)}
                      </span>
                    </div>
                    <div className="input-wrapper">
                      <input
                        type="number"
                        value={limitPrice}
                        onChange={e => setLimitPrice(e.target.value)}
                        placeholder="0.00"
                        className={priceWarning ? 'warning' : ''}
                      />
                      <span className="input-suffix">USD</span>
                    </div>
                    {priceWarning && (
                      <div className="warning-text">
                        ⚠️ {priceWarning}
                      </div>
                    )}
                  </div>

                  {/* === 模拟计算器 === */}
                  {userEstimate && (
                    <div className="simulator">
                      <div className="simulator-title">📊 成交预测</div>
                      <div className="simulator-row">
                        <span className="simulator-label">预计成交</span>
                        <span className={`simulator-value ${userEstimate.wouldMatch ? 'success' : 'fail'}`}>
                          {userEstimate.wouldMatch ? '✅ 可成交' : '❌ 可能出局'}
                        </span>
                      </div>
                      <div className="simulator-row">
                        <span className="simulator-label">预计获得代币</span>
                        <span className="simulator-value">
                          {formatters.amount(userEstimate.estimatedTokens)} wSPX
                        </span>
                      </div>
                      {userEstimate.refund > 0 && (
                        <div className="simulator-row">
                          <span className="simulator-label">预计退款</span>
                          <span className="simulator-value">
                            {formatters.amount(userEstimate.refund)} USDC
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {txError && (
                    <div className="error-text">
                      ❌ {txError}
                    </div>
                  )}

                  <div className="button-group">
                    <button
                      className="btn-trade btn-approve"
                      onClick={handleApprove}
                      disabled={isPending || !needsApproval}
                    >
                      {step === 'approving' && isConfirming ? '⏳ 确认中...' : '1. 授权 USDC'}
                    </button>
                    <button
                      className={`btn-trade btn-submit ${isPending ? 'loading' : ''}`}
                      onClick={handleBid}
                      disabled={isPending || !canBid || !isWhitelisted}
                    >
                      {step === 'bidding' && isConfirming ? '⏳ 提交中...' : '2. 提交订单'}
                    </button>
                  </div>

                  {/* === 链接区 === */}
                  <div className="links-bar">
                    <a 
                      href={`${PROJECT_CONFIG.explorer}/address/${AUCTION_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-item"
                    >
                      📜 查看合约
                    </a>
                    <a 
                      href={PROJECT_CONFIG.whitepaper}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-item"
                    >
                      📄 白皮书
                    </a>
                    <a 
                      href={PROJECT_CONFIG.audit}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-item"
                    >
                      🔒 审计报告
                    </a>
                  </div>
                </div>
              ) : currentPhase === AuctionPhase.SETTLEMENT ? (
                <div className="settlement-panel">
                  <div className="settlement-icon">🎉</div>
                  <div className="settlement-title">Round #{currentRoundId?.toString()} 已结算</div>
                  <div className="settlement-price">
                    最终清算价: ${roundData && roundData[1] > 0n 
                      ? formatters.price(Number(formatEther(roundData[1])))
                      : formatters.price(estimatedPrice)}
                  </div>
                  <div className="settlement-info">
                    本轮共 {realBids.length} 笔出价参与
                    {roundData && ` | 募资 ${formatters.amount(Number(formatEther(roundData[0])))} USDC`}
                  </div>
                  <button className="btn-next-round" onClick={handleStartNext} disabled={isPending}>
                    🚀 开启下一轮竞拍
                  </button>
                </div>
              ) : (
                <div className="trade-panel disabled">
                  <div className="panel-header">
                    <h3 className="panel-title">⏳ 等待中</h3>
                    <span className="badge badge-pending">清算处理中</span>
                  </div>
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    系统正在计算清算价格，请稍候...
                  </div>
                </div>
              )}

              {/* === 深度图 === */}
              <div className="depth-chart">
                <div className="depth-chart-title">📊 出价深度分布</div>
                <div className="depth-bars">
                  {depthData.length > 0 ? (
                    depthData.slice(0, 8).map((d, i) => {
                      const maxVolume = Math.max(...depthData.map(x => x.volume));
                      const widthPercent = (d.volume / maxVolume) * 100;
                      return (
                        <div key={i} className="depth-bar">
                          <span className="depth-price">${d.price}</span>
                          <div className="depth-bar-container">
                            <div 
                              className="depth-bar-fill" 
                              style={{ width: `${widthPercent}%` }}
                            ></div>
                          </div>
                          <span className="depth-volume">{formatters.amount(d.volume)} U</span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      暂无出价数据
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* === 侧边栏 === */}
            <div className="sidebar">
              {/* === 实时订单簿 === */}
              <div className="orderbook">
                <div className="orderbook-header">
                  <span className="orderbook-title">实时订单簿</span>
                  <div className="orderbook-legend">
                    <div className="legend-item">
                      <div className="legend-dot matched"></div>
                      <span>成交</span>
                    </div>
                    <div className="legend-item">
                      <div className="legend-dot unmatched"></div>
                      <span>出局</span>
                    </div>
                  </div>
                </div>
                
                {orderBookDisplay.length > 0 ? (
                  orderBookDisplay.map((order, i) => (
                    <div 
                      key={i} 
                      className={`orderbook-row ${
                        order.isPending ? 'pending' : 
                        order.isMarginal ? 'marginal' : 
                        order.isMatched ? 'matched' : 'unmatched'
                      }`}
                    >
                      <div>
                        <span className={`orderbook-price ${order.isMatched ? 'green' : 'red'}`}>
                          ${formatters.price(order.price)}
                        </span>
                        {order.isMarginal && <span style={{ marginLeft: 6, fontSize: 10 }}>🎯</span>}
                        {order.isPending && <span style={{ marginLeft: 6, fontSize: 10 }}>⏳</span>}
                      </div>
                      <div className="orderbook-volume">
                        {formatters.amount(order.volume)} U
                      </div>
                      <div className="orderbook-user">
                        {formatters.address(order.user)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="orderbook-empty">
                    等待出价中...
                  </div>
                )}
                
                <div className="update-time">
                  {realBids.length > 10 && `还有 ${realBids.length - 10} 笔订单`}
                </div>
              </div>

              {/* === 资产面板 === */}
              <div className="assets-panel">
                <div className="assets-title">我的资产</div>
                
                <div className="asset-row">
                  <div className="asset-info">
                    <div className="asset-icon usdc">$</div>
                    <div>
                      <div className="asset-name">USDC</div>
                      <div className="asset-symbol">Stablecoin</div>
                    </div>
                  </div>
                  <div className="asset-balance">
                    <div className="asset-amount">
                      {usdcBalance ? formatters.amount(Number(formatEther(usdcBalance))) : '0'}
                    </div>
                    <div className="asset-usd">
                      ≈ ${usdcBalance ? formatters.amount(Number(formatEther(usdcBalance))) : '0'}
                    </div>
                  </div>
                </div>
                
                <div className="asset-row">
                  <div className="asset-info">
                    <div className="asset-icon wspx">S</div>
                    <div>
                      <div className="asset-name">wSPX</div>
                      <div className="asset-symbol">SpaceX Token</div>
                    </div>
                  </div>
                  <div className="asset-balance">
                    <div className="asset-amount">
                      {userBidAmount ? formatters.amount(Number(formatEther(userBidAmount)) / estimatedPrice) : '0'}
                    </div>
                    <div className="asset-usd">本轮出价</div>
                  </div>
                </div>
                
                <button className="mint-btn" onClick={handleMint} disabled={isPending}>
                  💰 领取测试 USDC (10,000)
                </button>
              </div>

              {/* === 上轮结算结果 === */}
              {userSettlement && (
                <div className="assets-panel settlement-panel">
                  <div className="assets-title">🎉 Round #{userSettlement.roundId} 结算结果</div>
                  <div className="settlement-result">
                    <div className="settlement-row highlight">
                      <span>清算价格</span>
                      <span className="mono success">${formatters.price(userSettlement.clearingPrice)}</span>
                    </div>
                    <div className="settlement-row">
                      <span>您的总出价</span>
                      <span className="mono">{formatters.amount(userSettlement.totalBid)} USDC</span>
                    </div>
                    <div className="settlement-row highlight">
                      <span>🪙 获得代币</span>
                      <span className="mono success">{formatters.amount(userSettlement.tokensAllocated)} wSPX</span>
                    </div>
                    <div className="settlement-row">
                      <span>💵 实际花费</span>
                      <span className="mono">{formatters.amount(userSettlement.actualPaid)} USDC</span>
                    </div>
                    {userSettlement.refundAmount > 0 && (
                      <div className="settlement-row highlight">
                        <span>💰 可退款金额</span>
                        <span className="mono warning">{formatters.amount(userSettlement.refundAmount)} USDC</span>
                      </div>
                    )}
                    
                    <div className="settlement-actions">
                      {!userSettlement.hasClaimed && userSettlement.tokensAllocated > 0 && (
                        <button 
                          className="claim-btn primary"
                          onClick={handleClaimTokens}
                          disabled={isPending}
                        >
                          {isPending ? '⏳ 处理中...' : '🎁 领取 wSPX 代币'}
                        </button>
                      )}
                      {userSettlement.hasClaimed && userSettlement.tokensAllocated > 0 && (
                        <div className="claim-status success">✅ 代币已领取</div>
                      )}
                      
                      {!userSettlement.hasRefunded && userSettlement.refundAmount > 0 && (
                        <button 
                          className="claim-btn secondary"
                          onClick={handleClaimRefund}
                          disabled={isPending}
                        >
                          {isPending ? '⏳ 处理中...' : '💸 领取退款'}
                        </button>
                      )}
                      {userSettlement.hasRefunded && userSettlement.refundAmount > 0 && (
                        <div className="claim-status success">✅ 退款已领取</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* === 项目信息卡 === */}
              <div className="assets-panel">
                <div className="assets-title">项目信息</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  <p><strong>{PROJECT_CONFIG.name}</strong> ({PROJECT_CONFIG.symbol})</p>
                  <p style={{ marginTop: 8 }}>{PROJECT_CONFIG.description}</p>
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>总供应量</span>
                      <span className="mono">{formatters.amount(PROJECT_CONFIG.totalSupply)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>每轮发行</span>
                      <span className="mono">{PROJECT_CONFIG.supplyPerRound}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>绿鞋比例</span>
                      <span className="mono">{formatters.percent(PROJECT_CONFIG.greenShoeRatio)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="connect-prompt">
            <div className="connect-icon">🔐</div>
            <h2 className="connect-title">连接钱包参与竞拍</h2>
            <p className="connect-desc">
              连接您的 Web3 钱包，参与 SpaceX 股权代币化发行。
              我们采用集合竞价机制，确保公平定价。
            </p>
            <ConnectButton />
          </div>
        )}
      </div>
    </div>
  );
}
