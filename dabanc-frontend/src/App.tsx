import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { parseEther, formatEther } from 'viem';
import { AUCTION_ADDRESS, USDC_ADDRESS, AUCTION_ABI, USDC_ABI } from './constants';

// 🌟 增加 txHash 用于去重
type Bid = { user: string; amount: number; limitPrice: number; timestamp: number; txHash: string; };

export default function App() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  
  const [amount, setAmount] = useState('100');
  const [limitPrice, setLimitPrice] = useState('15.0');
  const [timeLeft, setTimeLeft] = useState(0);
  const [realBids, setRealBids] = useState<Bid[]>([]);

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // === 读取链上数据 (高频轮询) ===
  const { data: isRoundActive, refetch: refetchActive } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'isRoundActive', query: { refetchInterval: 2000 }
  });

  const { data: currentRoundId, refetch: refetchId } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'currentRoundId', query: { refetchInterval: 2000 }
  });

  const { data: lastClearingTime, refetch: refetchTime } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'lastClearingTime', query: { refetchInterval: 2000 }
  });

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: address ? [address] : undefined, query: { refetchInterval: 5000 }
  });

  // === 🌟 核心升级：通用数据拉取函数 (Fetcher) ===
  const fetchLogs = useCallback(async (fromBlock: bigint | 'earliest') => {
    if (!currentRoundId || !publicClient) return;
    try {
      // 获取最新区块
      const latestBlock = await publicClient.getBlockNumber();
      
      // 如果传入 earliest，为了安全起见（Alchemy限制），我们只查最近 19 个块
      // 如果是轮询，通常传入的是 latestBlock - 5
      let startBlock = fromBlock;
      if (fromBlock === 'earliest') {
          startBlock = latestBlock - 19n;
      }
      // 确保不为负数
      if (typeof startBlock === 'bigint' && startBlock < 0n) startBlock = 0n;

      const logs = await publicClient.getContractEvents({
        address: AUCTION_ADDRESS, abi: AUCTION_ABI, eventName: 'BidPlaced',
        args: { roundId: currentRoundId },
        fromBlock: startBlock, 
        toBlock: 'latest'
      });

      const newBids = await Promise.all(logs.map(async (log) => {
           const block = await publicClient.getBlock({ blockHash: log.blockHash });
           return {
               // @ts-ignore
               user: log.args.user,
               // @ts-ignore
               amount: Number(formatEther(log.args.amount)),
               // @ts-ignore
               limitPrice: Number(formatEther(log.args.limitPrice)),
               timestamp: Number(block.timestamp) * 1000, 
               txHash: log.transactionHash // 唯一ID
           };
      }));

      // 智能去重合并
      setRealBids(prev => {
        const existingHashes = new Set(prev.map(b => b.txHash));
        const uniqueNewBids = newBids.filter(b => !existingHashes.has(b.txHash));
        if (uniqueNewBids.length > 0) {
            console.log(`⚡ 自动更新: 新增 ${uniqueNewBids.length} 笔订单`);
            // 按时间排序合并
            return [...prev, ...uniqueNewBids].sort((a,b) => a.timestamp - b.timestamp);
        }
        return prev;
      });
    } catch (e) { 
        console.error("Poll Error:", e); 
    }
  }, [currentRoundId, publicClient]);

  // 1. 初始化加载 (查最近 20 块)
  useEffect(() => {
    fetchLogs('earliest');
  }, [currentRoundId, fetchLogs]);

  // 2. 🌟 主动轮询 (Auto-Refresh): 每 3 秒查一次最新数据
  useEffect(() => {
    const interval = setInterval(async () => {
        if (!publicClient) return;
        const bn = await publicClient.getBlockNumber();
        // 只查最近 5 个块，极为轻量，绝对不会报错
        fetchLogs(bn - 5n);
    }, 3000); // 3秒刷新一次
    return () => clearInterval(interval);
  }, [fetchLogs, publicClient]);

  // 换轮次时清空
  useEffect(() => {
    if (currentRoundId) { setRealBids([]); refetchTime(); } 
  }, [currentRoundId]);

  // 倒计时逻辑
  useEffect(() => {
    const timer = setInterval(() => {
      if (isRoundActive && lastClearingTime) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - Number(lastClearingTime);
        const remaining = 300 - elapsed;
        setTimeLeft(remaining > 0 ? remaining : 0);
      } else {
        setTimeLeft(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isRoundActive, lastClearingTime]);

  useEffect(() => { if (isConfirmed) { refetchActive(); refetchId(); refetchBalance(); fetchLogs('earliest'); reset(); } }, [isConfirmed, fetchLogs]);

  // === 撮合引擎 ===
  const { estimatedPrice, orderBookDisplay } = useMemo(() => {
    if (realBids.length === 0) return { estimatedPrice: "1.00", orderBookDisplay: [] };
    const sortedBids = [...realBids].sort((a, b) => b.limitPrice - a.limitPrice);
    
    let accumulated = 0;
    let clearingPrice = 1.0;
    const SUPPLY = 500;

    for (const bid of sortedBids) {
        accumulated += bid.amount / bid.limitPrice;
        if (accumulated >= SUPPLY) { clearingPrice = bid.limitPrice; break; }
    }
    if (accumulated < SUPPLY && sortedBids.length > 0) clearingPrice = sortedBids[sortedBids.length - 1].limitPrice;
    
    const display = sortedBids.slice(0, 8).map(b => ({
        price: b.limitPrice.toFixed(2), volume: b.amount.toFixed(0), isMatched: b.limitPrice >= clearingPrice
    }));
    return { estimatedPrice: clearingPrice.toFixed(2), orderBookDisplay: display };
  }, [realBids]);

  const handleApprove = () => writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [AUCTION_ADDRESS, parseEther(amount)] });
  const handleBid = () => writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'placeBid', args: [parseEther(amount), parseEther(limitPrice)] });
  const handleMint = () => writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'mint', args: [address!, parseEther('1000')] });
  const handleStartNext = () => writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'startNextRound' });

  const formatTimeStr = (s: number) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;

  return (
    <div style={{ padding: '40px', minHeight: '100vh', background: '#0b0e11', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', borderBottom: '1px solid #2d3748', paddingBottom: '20px' }}>
          <div>
            <h1 style={{margin: '0 0 5px 0', fontSize: '24px', color: 'white'}}>SpaceX Equity <span style={{color: '#4ade80'}}>Orderbook</span></h1>
            <span style={{fontSize: '12px', color: '#94a3b8'}}>Auto-Refreshing Live Data (Polling 3s)</span>
          </div>
          <ConnectButton />
        </div>

        {isConnected ? (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                 <div style={cardStyle}>
                    <div style={labelStyle}>ROUND STATUS</div>
                    <div style={{fontSize: '28px', fontWeight: 'bold', color: isRoundActive ? '#4ade80' : '#f87171'}}>
                        {isRoundActive ? `LIVE #${currentRoundId?.toString()}` : 'SETTLED'}
                    </div>
                    <div style={{marginTop: '5px', fontSize: '14px', fontFamily: 'monospace'}}>
                        ⏱️ {formatTimeStr(timeLeft)}
                    </div>
                 </div>
                 <div style={cardStyle}>
                    <div style={labelStyle}>REAL-TIME CLEARING PRICE</div>
                    <div style={{fontSize: '28px', fontWeight: 'bold', color: 'white'}}>${estimatedPrice}</div>
                    <div style={{marginTop: '5px', fontSize: '12px', color: '#94a3b8'}}>Based on {realBids.length} active bids</div>
                 </div>
              </div>

              {isRoundActive ? (
                <div style={{...cardStyle, border: '1px solid #3b82f6'}}>
                  <h3 style={{marginTop: 0, marginBottom: '20px', color: '#60a5fa'}}>Place Limit Order</h3>
                  <div style={{display: 'flex', gap: '20px', marginBottom: '20px'}}>
                    <div style={{flex: 1}}><div style={labelStyle}>BID AMOUNT (USDC)</div><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={inputStyle} /></div>
                    <div style={{flex: 1}}><div style={labelStyle}>LIMIT PRICE ($)</div><input type="number" value={limitPrice} onChange={e=>setLimitPrice(e.target.value)} style={inputStyle} /></div>
                  </div>
                  <div style={{display: 'flex', gap: '10px'}}>
                    <button onClick={handleApprove} disabled={isPending} style={secondaryBtn}>1. Approve</button>
                    <button onClick={handleBid} disabled={isPending} style={primaryBtn}>2. Submit Order</button>
                  </div>
                  {hash && <div style={{marginTop: '15px', color: '#60a5fa'}}>⏳ Transaction Pending...</div>}
                </div>
              ) : (
                <div style={{...cardStyle, background: '#064e3b', border: '1px solid #059669', textAlign: 'center', padding: '40px'}}>
                    <h2 style={{color: '#34d399'}}>✅ Round Settled</h2>
                    <p>Final Price: <strong style={{fontSize: '24px'}}>${estimatedPrice}</strong></p>
                    <div style={{marginTop: '20px'}}><button onClick={handleStartNext} style={{...primaryBtn, background: 'white', color: '#064e3b'}}>🚀 Start Next Round</button></div>
                </div>
              )}
            </div>

            <div style={cardStyle}>
                <h3 style={{marginTop: 0, fontSize: '14px', color: '#94a3b8', borderBottom: '1px solid #2d3748', paddingBottom: '10px'}}>LIVE ORDERBOOK (Top 8)</h3>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '10px'}}><span>Price ($)</span><span>Volume</span></div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '200px'}}>
                    {orderBookDisplay.length === 0 && <div style={{textAlign: 'center', color: '#4a5568', marginTop: '50px'}}>Waiting for bids...</div>}
                    {orderBookDisplay.map((order, i) => (
                        <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontFamily: 'monospace', opacity: order.isMatched ? 1 : 0.4}}>
                            <span style={{color: order.isMatched ? '#4ade80' : '#f87171'}}>${order.price} {order.isMatched ? '✓' : ''}</span>
                            <span style={{color: 'white'}}>{order.volume}</span>
                        </div>
                    ))}
                </div>
                <div style={{marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #2d3748'}}>
                    <h3 style={{marginTop: 0, fontSize: '14px', color: '#94a3b8'}}>MY ASSETS</h3>
                    <div style={{fontSize: '20px', fontWeight: 'bold'}}>{usdcBalance ? Number(formatEther(usdcBalance)).toFixed(2) : 0} USDC</div>
                    <button onClick={handleMint} style={{background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, marginTop: '5px'}}>+ Mint Test Tokens</button>
                </div>
            </div>
          </div>
        ) : ( <div style={{textAlign: 'center', marginTop: '100px', color: '#94a3b8'}}>Please connect wallet.</div> )}
      </div>
    </div>
  );
}

const cardStyle = { background: '#1a202c', padding: '24px', borderRadius: '12px', border: '1px solid #2d3748' };
const labelStyle = { fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 'bold', letterSpacing: '0.5px' };
const inputStyle = { width: '100%', padding: '12px', background: '#2d3748', border: '1px solid #4a5568', color: 'white', borderRadius: '8px', fontSize: '18px', boxSizing: 'border-box' as const };
const btnBase = { flex: 1, padding: '14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' };
const primaryBtn = { ...btnBase, background: '#3b82f6', color: 'white' };
const secondaryBtn = { ...btnBase, background: '#2d3748', color: '#cbd5e1' };