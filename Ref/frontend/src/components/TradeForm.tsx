"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useMarketStore } from "@/store/marketStore";
import { useBalanceStore } from "@/store/balanceStore";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ArrowDownUp, AlertCircle, CheckCircle2, Zap } from "lucide-react";

type OrderSide = "buy" | "sell";
type OrderType = "limit" | "market";

export function TradeForm() {
  const { address, isConnected } = useAccount();
  const { market, placeOrder, isLoading, error: storeError, orderBook } = useMarketStore();
  
  // 使用共享的余额状态
  const { goAvailable, rwaAvailable, isLoaded } = useBalanceStore();

  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 设置默认价格为最后成交价
  useEffect(() => {
    if (market?.lastPrice && !price) {
      setPrice(market.lastPrice.toFixed(6));
    }
  }, [market?.lastPrice]);

  // 计算交易所需金额
  const calculateRequired = (): { amount: number; token: string } => {
    const priceNum = parseFloat(price) || 0;
    const amountNum = parseFloat(amount) || 0;
    
    if (side === "buy") {
      return { amount: priceNum * amountNum, token: "GO" };
    } else {
      return { amount: amountNum, token: "RWA" };
    }
  };

  // 验证余额是否足够
  const validateBalance = (): boolean => {
    const required = calculateRequired();
    const available = side === "buy" ? goAvailable : rwaAvailable;
    
    if (required.amount > available) {
      setValidationError(
        `Insufficient ${required.token} balance. Required: ${required.amount.toFixed(4)}, Available: ${available.toFixed(4)}`
      );
      return false;
    }
    
    setValidationError(null);
    return true;
  };

  // 链下下单（发送到后端）
  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !address) return;

    if (!price || !amount) {
      setValidationError("Please enter price and amount");
      return;
    }

    // 验证余额
    if (!validateBalance()) {
      return;
    }

    try {
      await placeOrder({
        marketId: "RWA-GO",
        side,
        price: parseFloat(price),
        amount: parseFloat(amount),
        userAddress: address,
      });

      // 注意: 余额不在此处更新
      // 只有当订单被撮合成交后，通过 WebSocket 收到成交通知时才更新余额
      // 参见 marketStore.ts 中的 trade 事件处理

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setAmount("");
      setValidationError(null);
    } catch (err) {
      console.error("Order failed:", err);
    }
  };

  const total = price && amount ? (parseFloat(price) * parseFloat(amount)).toFixed(4) : "0.00";

  // 快速填充
  const handleQuickFill = (percentage: number) => {
    if (side === "buy" && price && goAvailable > 0) {
      const maxAmount = (goAvailable * percentage) / parseFloat(price);
      setAmount(maxAmount.toFixed(4));
    } else if (side === "sell" && rwaAvailable > 0) {
      setAmount((rwaAvailable * percentage).toFixed(4));
    }
    setValidationError(null);
  };

  const setBestPrice = () => {
    if (side === "buy" && orderBook.asks.length > 0) {
      setPrice(orderBook.asks[0].price.toFixed(6));
    } else if (side === "sell" && orderBook.bids.length > 0) {
      setPrice(orderBook.bids[0].price.toFixed(6));
    }
  };

  const displayError = validationError || storeError;

  return (
    <div>
      {/* 余额显示 - 与 WalletPanel 同步 */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-surface-900/50 rounded-xl">
          <div className="text-center">
            <div className="text-xs text-surface-500 mb-1">GO Trading Balance</div>
            <div className="font-mono text-green-400 text-lg">
              {isLoaded ? goAvailable.toFixed(4) : "Loading..."}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-surface-500 mb-1">RWA Trading Balance</div>
            <div className="font-mono text-purple-400 text-lg">
              {isLoaded ? rwaAvailable.toFixed(4) : "Loading..."}
            </div>
          </div>
        </div>
      )}

      {/* Buy/Sell Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setSide("buy"); setValidationError(null); }}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            side === "buy"
              ? "bg-accent-green text-white shadow-lg shadow-accent-green/25"
              : "bg-surface-800 text-surface-400 hover:bg-surface-700"
          }`}
        >
          Buy RWA
        </button>
        <button
          onClick={() => { setSide("sell"); setValidationError(null); }}
          className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
            side === "sell"
              ? "bg-accent-red text-white shadow-lg shadow-accent-red/25"
              : "bg-surface-800 text-surface-400 hover:bg-surface-700"
          }`}
        >
          Sell RWA
        </button>
      </div>

      {/* CEX Mode Indicator */}
      <div className="flex items-center justify-center gap-2 mb-4 py-2 bg-yellow-600/10 border border-yellow-500/30 rounded-lg">
        <Zap size={14} className="text-yellow-400" />
        <span className="text-xs text-yellow-400">Off-Chain Trading - Instant Execution</span>
      </div>

      {/* Order Type */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOrderType("limit")}
          className={`flex-1 py-2 text-sm rounded-lg transition-all ${
            orderType === "limit"
              ? "bg-primary-500/20 text-primary-400 border border-primary-500/50"
              : "text-surface-400 hover:bg-surface-800"
          }`}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderType("market")}
          className={`flex-1 py-2 text-sm rounded-lg transition-all ${
            orderType === "market"
              ? "bg-primary-500/20 text-primary-400 border border-primary-500/50"
              : "text-surface-400 hover:bg-surface-800"
          }`}
        >
          Market
        </button>
      </div>

      <form onSubmit={handleOrder} className="space-y-4">
        {/* Price Input */}
        {orderType === "limit" && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-surface-400">Price</label>
              <button
                type="button"
                onClick={setBestPrice}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                Best Price
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.000001"
                value={price}
                onChange={(e) => { setPrice(e.target.value); setValidationError(null); }}
                placeholder="0.00"
                className="input-field pr-16"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500">
                GO
              </span>
            </div>
          </div>
        )}

        {/* Amount Input */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm text-surface-400">Amount</label>
            <span className="text-xs text-surface-500">
              Available: {side === "buy" ? `${goAvailable.toFixed(4)} GO` : `${rwaAvailable.toFixed(4)} RWA`}
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              step="0.0001"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setValidationError(null); }}
              placeholder="0.00"
              className="input-field pr-14"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-500">
              RWA
            </span>
          </div>
          {/* Quick Fill */}
          <div className="flex gap-2 mt-2">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleQuickFill(pct)}
                className="flex-1 py-1 text-xs text-surface-400 bg-surface-800 
                         rounded hover:bg-surface-700 transition-colors"
              >
                {pct * 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="bg-surface-900/50 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <span className="text-surface-400">Total</span>
            <span className="font-mono text-lg font-semibold">
              {total} <span className="text-surface-500">GO</span>
            </span>
          </div>
          {side === "buy" && parseFloat(total) > goAvailable && (
            <div className="text-xs text-red-400 mt-1">
              ⚠️ Insufficient GO balance (need {parseFloat(total).toFixed(4)} GO)
            </div>
          )}
          {side === "sell" && parseFloat(amount || "0") > rwaAvailable && (
            <div className="text-xs text-red-400 mt-1">
              ⚠️ Insufficient RWA balance (need {parseFloat(amount || "0").toFixed(4)} RWA)
            </div>
          )}
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {displayError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 p-3 bg-accent-red/20 rounded-xl text-accent-red text-sm"
            >
              <AlertCircle size={16} />
              <span className="break-all">{displayError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Message */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 p-3 bg-accent-green/20 rounded-xl text-accent-green text-sm"
            >
              <CheckCircle2 size={16} />
              Order placed! Will be batched to chain.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit Button */}
        {isConnected ? (
          <button
            type="submit"
            disabled={isLoading || !price || !amount || !isLoaded}
            className={`w-full py-4 rounded-xl font-semibold text-white transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed ${
              side === "buy"
                ? "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-lg shadow-green-500/25"
                : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/25"
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <ArrowDownUp size={18} />
                </motion.div>
                Processing...
              </span>
            ) : (
              `${side === "buy" ? "Buy" : "Sell"} RWA`
            )}
          </button>
        ) : (
          <button
            type="button"
            className="w-full py-4 rounded-xl font-semibold bg-primary-600 text-white 
                     flex items-center justify-center gap-2 hover:bg-primary-500 transition-colors"
          >
            <Wallet size={18} />
            Connect Wallet to Trade
          </button>
        )}
      </form>

      {/* Order Info */}
      <div className="mt-4 p-3 bg-surface-900/30 rounded-xl text-xs text-surface-500">
        <div className="flex justify-between">
          <span>Trading Fee</span>
          <span>0.1%</span>
        </div>
        <div className="flex justify-between mt-1">
          <span>Mode</span>
          <span className="text-yellow-400">⚡ Off-Chain Trading</span>
        </div>
        <div className="flex justify-between mt-1">
          <span>Settlement</span>
          <span>Batched On-Chain</span>
        </div>
      </div>
    </div>
  );
}
