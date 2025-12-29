"use client";

import { useMarketStore } from "@/store/marketStore";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

export function RecentTrades() {
  const { recentTrades } = useMarketStore();

  const formatPrice = (price: number) => price.toFixed(6);
  const formatAmount = (amount: number) => {
    if (amount >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(2) + 'K';
    return amount.toFixed(2);
  };

  // 判断价格方向（与前一笔对比）
  const getTradeDirection = (index: number): 'up' | 'down' | 'neutral' => {
    if (index >= recentTrades.length - 1) return 'neutral';
    const currentPrice = recentTrades[index].price;
    const prevPrice = recentTrades[index + 1].price;
    if (currentPrice > prevPrice) return 'up';
    if (currentPrice < prevPrice) return 'down';
    return 'neutral';
  };

  return (
    <div className="h-[400px] flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 px-3 py-2 text-xs text-surface-400 uppercase tracking-wider border-b border-surface-800">
        <span>Price (GO)</span>
        <span className="text-right">Amount (RWA)</span>
        <span className="text-right">Time</span>
      </div>

      {/* Trades List */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {recentTrades.length === 0 ? (
            <div className="flex items-center justify-center h-full text-surface-500">
              No trades yet
            </div>
          ) : (
            recentTrades.map((trade, index) => {
              const direction = getTradeDirection(index);
              return (
                <motion.div
                  key={trade.id}
                  initial={{ opacity: 0, x: -20, backgroundColor: direction === 'up' ? 'rgba(34, 197, 94, 0.2)' : direction === 'down' ? 'rgba(239, 68, 68, 0.2)' : 'transparent' }}
                  animate={{ opacity: 1, x: 0, backgroundColor: 'transparent' }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-3 gap-4 py-2 px-3 text-sm font-mono hover:bg-surface-800/50 
                           transition-colors border-b border-surface-900/50"
                >
                  <span className={`tabular-nums ${
                    direction === 'up' ? 'text-accent-green' : 
                    direction === 'down' ? 'text-accent-red' : 
                    'text-surface-300'
                  }`}>
                    {formatPrice(trade.price)}
                  </span>
                  <span className="text-right tabular-nums text-surface-300">
                    {formatAmount(trade.amount)}
                  </span>
                  <span className="text-right tabular-nums text-surface-500">
                    {format(new Date(trade.timestamp), 'HH:mm:ss')}
                  </span>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Summary */}
      {recentTrades.length > 0 && (
        <div className="border-t border-surface-800 p-3 bg-surface-900/30">
          <div className="flex justify-between text-xs text-surface-500">
            <span>Last 50 trades</span>
            <span>
              Vol: {formatAmount(recentTrades.reduce((sum, t) => sum + t.amount, 0))} RWA
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

