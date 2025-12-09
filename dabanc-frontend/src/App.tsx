import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useState, useEffect } from 'react';
import { parseEther, formatEther } from 'viem';
import { AUCTION_ADDRESS, USDC_ADDRESS, AUCTION_ABI, USDC_ABI } from './constants';

export default function App() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState('100');
  const [timeLeft, setTimeLeft] = useState(300);

  // 写入 Hooks
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // === 读取 Hooks (高频刷新) ===
  const { data: isRoundActive, refetch: refetchActive } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'isRoundActive',
    query: { refetchInterval: 2000 }
  });

  const { data: currentRoundId, refetch: refetchId } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'currentRoundId',
    query: { refetchInterval: 2000 }
  });

  const { data: currentRoundData, refetch: refetchCurrent } = useReadContract({
    address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'rounds',
    args: currentRoundId ? [currentRoundId] : undefined,
    query: { refetchInterval: 2000 }
  });

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: address ? [address] : undefined,
    query: { refetchInterval: 5000 }
  });

  // 倒计时逻辑
  useEffect(() => {
    // 如果是活跃状态，重置为300并开始倒数；否则归零
    if (isRoundActive) {
       // 注意：这里为了演示简单，每次刷新页面或状态变更为活跃时都会重置为300
       // 在生产环境中，应该读取链上 lastClearingTime 进行精确计算
       setTimeLeft((prev) => prev > 0 ? prev : 300); 
    } else {
       setTimeLeft(0);
    }
  }, [isRoundActive]);

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  // 交易成功后刷新
  useEffect(() => {
    if (isConfirmed) {
      refetchActive(); refetchId(); refetchCurrent(); refetchBalance(); reset();
    }
  }, [isConfirmed]);

  // === 按钮操作 ===
  const handleApprove = () => writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [AUCTION_ADDRESS, parseEther(amount)] });
  const handleBid = () => writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'placeBid', args: [parseEther(amount)] });
  const handleMint = () => writeContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'mint', args: [address!, parseEther('1000')] });
  
  // 🚀 管理员开启下一轮
  const handleStartNext = () => writeContract({ address: AUCTION_ADDRESS, abi: AUCTION_ABI, functionName: 'startNextRound' });

  // 辅助计算
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  const currentTotal = currentRoundData ? Number(formatEther(currentRoundData[0])) : 0;
  // 500 wSPX 发行量
  const estimatedPrice = currentTotal > 0 ? (currentTotal / 500).toFixed(2) : "1.00";

  return (
    <div style={{ padding: '40px', minHeight: '100vh', background: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* 顶部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
          <div>
            <h1 style={{margin: '0 0 5px 0'}}>SpaceX Launchpad</h1>
            <span style={{fontSize: '12px', color: '#94a3b8'}}>DABANC Protocol | Sepolia Testnet</span>
          </div>
          <ConnectButton />
        </div>

        {isConnected ? (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
            
            {/* 左侧主区域 */}
            <div>
              {/* === 状态 A: 竞价进行中 === */}
              {isRoundActive ? (
                <div style={{ background: '#1e293b', padding: '30px', borderRadius: '20px', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '12px', letterSpacing: '1px' }}>ROUND #{currentRoundId?.toString()}</div>
                      <div style={{ fontSize: '48px', fontWeight: 'bold' }}>{formatTime(timeLeft)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                       <div style={{ color: '#94a3b8', fontSize: '12px', letterSpacing: '1px' }}>EST. PRICE</div>
                       <div style={{ fontSize: '48px', color: '#4ade80', fontWeight: 'bold' }}>${estimatedPrice}</div>
                    </div>
                  </div>
                  
                  {/* 出价操作 */}
                  <div style={{ background: '#0f172a', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
                    <div style={{display: 'flex', alignItems: 'center'}}>
                      <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '28px', width: '100%', outline: 'none' }} />
                      <span style={{color: '#64748b'}}>USDC</span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button onClick={handleApprove} style={btnStyle}>1. 授权 (Approve)</button>
                    <button onClick={handleBid} style={{...btnStyle, background: '#3b82f6', color: 'white'}}>2. 出价 (Place Bid)</button>
                  </div>
                  
                  {isPending && <div style={{marginTop: '15px', color: '#fbbf24'}}>🔔 请在钱包中签名...</div>}
                  {hash && isConfirming && <div style={{marginTop: '15px', color: '#60a5fa'}}>⏳ 交易确认中...</div>}

                  <div style={{marginTop: '15px'}}>
                     <button onClick={handleMint} style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline'}}>账户没钱? 点击领水</button>
                  </div>
                </div>
              ) : (
                // === 状态 B: 竞价结束，显示结算报告 ===
                <div style={{ background: '#f0fdf4', padding: '30px', borderRadius: '20px', border: '2px solid #22c55e', color: '#0f172a' }}>
                  <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', marginBottom: '10px' }}>🏁 ROUND #{currentRoundId?.toString()} 结算完成</div>
                    <div style={{ fontSize: '56px', fontWeight: '900', color: '#15803d' }}>
                      ${estimatedPrice}
                    </div>
                    <div style={{ color: '#166534', fontWeight: 'bold' }}>最终清算价格 / wSPX</div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.6)', padding: '15px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                    <span>本轮总募资:</span>
                    <strong>{currentTotal} USDC</strong>
                  </div>

                  {/* 管理员控制区 */}
                  <div style={{ background: '#14532d', padding: '25px', borderRadius: '16px', color: 'white', textAlign: 'center' }}>
                    <div style={{ marginBottom: '15px', fontSize: '14px', opacity: 0.9 }}>👨‍✈️ 管理员控制台 (Admin Control)</div>
                    <button 
                      onClick={handleStartNext} 
                      disabled={isPending || isConfirming}
                      style={{ padding: '16px 40px', fontSize: '18px', fontWeight: 'bold', borderRadius: '50px', border: 'none', background: 'white', color: '#14532d', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}
                    >
                      {isPending ? '启动中...' : '🚀 开启下一轮 (Start Next Round)'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧信息栏 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '16px' }}>
                <h3 style={{marginTop: 0, fontSize: '14px', color: '#94a3b8'}}>MY BALANCE</h3>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>{usdcBalance ? Number(formatEther(usdcBalance)).toFixed(2) : 0} USDC</div>
              </div>
              
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '16px' }}>
                <h3 style={{marginTop: 0, fontSize: '14px', color: '#94a3b8'}}>MARKET INFO</h3>
                <div style={{marginBottom: '10px', fontSize: '14px', display: 'flex', justifyContent: 'space-between'}}>
                  <span>Supply:</span> <span>500.0 wSPX</span>
                </div>
                <div style={{fontSize: '14px', display: 'flex', justifyContent: 'space-between'}}>
                  <span>Network:</span> <span style={{color: '#4ade80'}}>Sepolia</span>
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div style={{textAlign: 'center', marginTop: '100px', color: '#94a3b8'}}>请连接钱包参与 SpaceX 股权竞价</div>
        )}
      </div>
    </div>
  );
}

const btnStyle = { flex: 1, padding: '15px', borderRadius: '10px', border: 'none', background: '#334155', color: '#cbd5e1', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };