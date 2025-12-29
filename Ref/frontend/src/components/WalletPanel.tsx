"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from "wagmi";
import { parseEther, formatEther, Address } from "viem";
import { useBalanceStore } from "@/store/balanceStore";
import { 
  SETTLEMENT_CONTRACT_ADDRESS, 
  TOKEN_ADDRESSES, 
  SETTLEMENT_ABI, 
  ERC20_ABI 
} from "@/lib/contracts";

export function WalletPanel() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [selectedToken, setSelectedToken] = useState<"GO" | "RWA">("GO");
  const [amount, setAmount] = useState("");
  
  // 共享的余额状态
  const { 
    goAvailable, goLocked, rwaAvailable, rwaLocked,
    goWallet, rwaWallet,
    setTradingBalance, setWalletBalance, setLoaded 
  } = useBalanceStore();
  
  const tokenAddress = TOKEN_ADDRESSES[selectedToken];
  const isConfigured = SETTLEMENT_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" &&
                       TOKEN_ADDRESSES.GO !== "0x0000000000000000000000000000000000000000";

  // 读取 ETH 余额
  const { data: ethBalance } = useBalance({ address });

  // 读取 GO 钱包余额
  const { data: goWalletBalance, refetch: refetchGoWallet } = useReadContract({
    address: TOKEN_ADDRESSES.GO as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConfigured }
  });

  // 读取 RWA 钱包余额
  const { data: rwaWalletBalance, refetch: refetchRwaWallet } = useReadContract({
    address: TOKEN_ADDRESSES.RWA as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConfigured }
  });

  // 读取 GO 合约余额
  const { data: goContractBalance, refetch: refetchGoContract } = useReadContract({
    address: SETTLEMENT_CONTRACT_ADDRESS as Address,
    abi: SETTLEMENT_ABI,
    functionName: "getBalance",
    args: address ? [address, TOKEN_ADDRESSES.GO] : undefined,
    query: { enabled: !!address && isConfigured }
  });

  // 读取 RWA 合约余额
  const { data: rwaContractBalance, refetch: refetchRwaContract } = useReadContract({
    address: SETTLEMENT_CONTRACT_ADDRESS as Address,
    abi: SETTLEMENT_ABI,
    functionName: "getBalance",
    args: address ? [address, TOKEN_ADDRESSES.RWA] : undefined,
    query: { enabled: !!address && isConfigured }
  });

  // 读取授权额度
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress as Address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SETTLEMENT_CONTRACT_ADDRESS] : undefined,
    query: { enabled: !!address && isConfigured }
  });

  // 写入合约
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  
  // 等待交易确认
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // 同步钱包余额到 store
  useEffect(() => {
    if (goWalletBalance !== undefined) {
      setWalletBalance("GO", parseFloat(formatEther(goWalletBalance as bigint)));
    }
  }, [goWalletBalance, setWalletBalance]);

  useEffect(() => {
    if (rwaWalletBalance !== undefined) {
      setWalletBalance("RWA", parseFloat(formatEther(rwaWalletBalance as bigint)));
    }
  }, [rwaWalletBalance, setWalletBalance]);

  // 同步合约余额到 store
  useEffect(() => {
    if (goContractBalance) {
      const [available, locked] = goContractBalance as [bigint, bigint];
      setTradingBalance("GO", parseFloat(formatEther(available)), parseFloat(formatEther(locked)));
    }
  }, [goContractBalance, setTradingBalance]);

  useEffect(() => {
    if (rwaContractBalance) {
      const [available, locked] = rwaContractBalance as [bigint, bigint];
      setTradingBalance("RWA", parseFloat(formatEther(available)), parseFloat(formatEther(locked)));
      setLoaded(true);
    }
  }, [rwaContractBalance, setTradingBalance, setLoaded]);

  // 交易成功后刷新所有余额
  useEffect(() => {
    if (isSuccess) {
      refetchGoWallet();
      refetchRwaWallet();
      refetchGoContract();
      refetchRwaContract();
      refetchAllowance();
      setAmount("");
      reset();
    }
  }, [isSuccess, refetchGoWallet, refetchRwaWallet, refetchGoContract, refetchRwaContract, refetchAllowance, reset]);

  const handleApprove = () => {
    writeContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [SETTLEMENT_CONTRACT_ADDRESS, parseEther("1000000000")],
    });
  };

  const handleDeposit = () => {
    if (!amount) return;
    writeContract({
      address: SETTLEMENT_CONTRACT_ADDRESS as Address,
      abi: SETTLEMENT_ABI,
      functionName: "deposit",
      args: [tokenAddress, parseEther(amount)],
    });
  };

  const handleWithdraw = () => {
    if (!amount) return;
    writeContract({
      address: SETTLEMENT_CONTRACT_ADDRESS as Address,
      abi: SETTLEMENT_ABI,
      functionName: "withdraw",
      args: [tokenAddress, parseEther(amount)],
    });
  };

  const needsApproval = activeTab === "deposit" && 
    allowance !== undefined && 
    amount && 
    parseFloat(amount) > 0 &&
    parseEther(amount) > (allowance as bigint);

  if (!isConnected) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>💰</span> Wallet
        </h2>
        <p className="text-gray-400 text-center py-8">
          Connect wallet to manage funds
        </p>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>💰</span> Wallet
        </h2>
        <p className="text-yellow-400 text-center py-4 text-sm">
          ⚠️ Contracts not configured.
        </p>
        <p className="text-gray-500 text-center text-xs">
          Please deploy contracts and set environment variables:
        </p>
        <div className="mt-2 p-2 bg-gray-800 rounded text-xs text-gray-400 font-mono">
          NEXT_PUBLIC_SETTLEMENT_CONTRACT<br/>
          NEXT_PUBLIC_GO_TOKEN<br/>
          NEXT_PUBLIC_RWA_TOKEN
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span>💰</span> Wallet
      </h2>

      {/* ETH 余额 */}
      <div className="bg-gray-800/30 rounded-lg p-3 mb-4">
        <div className="text-gray-400 text-xs mb-1">ETH Balance (for Gas)</div>
        <div className="text-lg font-mono text-blue-400">
          {ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : "0"} ETH
        </div>
      </div>

      {/* 钱包余额 */}
      <div className="mb-4">
        <div className="text-gray-400 text-xs mb-2">📦 Wallet Balances (on-chain)</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">GO</div>
            <div className="font-mono text-green-400">{goWallet.toFixed(4)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-500 text-xs">RWA</div>
            <div className="font-mono text-purple-400">{rwaWallet.toFixed(4)}</div>
          </div>
        </div>
      </div>

      {/* 交易余额 */}
      <div className="mb-4">
        <div className="text-gray-400 text-xs mb-2">🏦 Trading Balances (in contract)</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-3">
            <div className="text-green-500 text-xs font-bold">GO</div>
            <div className="font-mono text-green-400 text-lg">{goAvailable.toFixed(4)}</div>
            {goLocked > 0 && (
              <div className="text-xs text-yellow-500">🔒 {goLocked.toFixed(4)}</div>
            )}
          </div>
          <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-3">
            <div className="text-purple-500 text-xs font-bold">RWA</div>
            <div className="font-mono text-purple-400 text-lg">{rwaAvailable.toFixed(4)}</div>
            {rwaLocked > 0 && (
              <div className="text-xs text-yellow-500">🔒 {rwaLocked.toFixed(4)}</div>
            )}
          </div>
        </div>
      </div>

      {/* 代币选择 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSelectedToken("GO")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            selectedToken === "GO"
              ? "bg-green-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          GO
        </button>
        <button
          onClick={() => setSelectedToken("RWA")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            selectedToken === "RWA"
              ? "bg-purple-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          RWA
        </button>
      </div>

      {/* 存款/提现切换 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("deposit")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            activeTab === "deposit"
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => setActiveTab("withdraw")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            activeTab === "withdraw"
              ? "bg-orange-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          Withdraw
        </button>
      </div>

      {/* 金额输入 */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-400 mb-1">
          <span>Amount</span>
          <button 
            onClick={() => {
              if (activeTab === "deposit") {
                const walletBal = selectedToken === "GO" ? goWallet : rwaWallet;
                setAmount(walletBal.toString());
              } else {
                const available = selectedToken === "GO" ? goAvailable : rwaAvailable;
                setAmount(available.toString());
              }
            }}
            className="text-blue-400 hover:text-blue-300"
          >
            MAX
          </button>
        </div>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:border-blue-500"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
            {selectedToken}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {activeTab === "deposit" 
            ? `Available in wallet: ${(selectedToken === "GO" ? goWallet : rwaWallet).toFixed(4)} ${selectedToken}`
            : `Available to withdraw: ${(selectedToken === "GO" ? goAvailable : rwaAvailable).toFixed(4)} ${selectedToken}`
          }
        </div>
      </div>

      {/* 操作按钮 */}
      {activeTab === "deposit" ? (
        needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={isPending || isConfirming}
            className="w-full py-3 rounded-lg font-bold bg-yellow-600 hover:bg-yellow-700 transition disabled:opacity-50"
          >
            {isPending || isConfirming ? "⏳ Approving..." : `🔓 Approve ${selectedToken}`}
          </button>
        ) : (
          <button
            onClick={handleDeposit}
            disabled={isPending || isConfirming || !amount || parseFloat(amount) <= 0}
            className="w-full py-3 rounded-lg font-bold bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isPending || isConfirming ? "⏳ Depositing..." : "📥 Deposit (On-Chain)"}
          </button>
        )
      ) : (
        <button
          onClick={handleWithdraw}
          disabled={isPending || isConfirming || !amount || parseFloat(amount) <= 0}
          className="w-full py-3 rounded-lg font-bold bg-orange-600 hover:bg-orange-700 transition disabled:opacity-50"
        >
          {isPending || isConfirming ? "⏳ Withdrawing..." : "📤 Withdraw (On-Chain)"}
        </button>
      )}

      {/* 交易状态 */}
      {txHash && (
        <div className="mt-4 text-sm">
          {isConfirming && (
            <p className="text-yellow-400">⏳ Waiting for confirmation...</p>
          )}
          {isSuccess && (
            <p className="text-green-400">✅ Transaction confirmed!</p>
          )}
        </div>
      )}

      {/* 提示信息 */}
      <div className="mt-4 p-3 bg-gray-800/30 rounded-lg text-xs text-gray-500">
        <p className="mb-1">📥 <strong>Deposit</strong>: Transfer tokens to trading account (requires MetaMask)</p>
        <p className="mb-1">📤 <strong>Withdraw</strong>: Withdraw tokens to wallet (requires MetaMask)</p>
        <p className="text-blue-400">🔗 Deposit & Withdraw are on-chain operations</p>
      </div>
    </div>
  );
}
