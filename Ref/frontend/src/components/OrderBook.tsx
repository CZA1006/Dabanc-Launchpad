"use client";

import { useMarketStore } from "@/store/marketStore";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";

export function OrderBook() {
  const { orderBook, market } = useMarketStore();

  const maxBidTotal = useMemo(() => 
    Math.max(...orderBook.bids.map(b => b.amount), 1),
    [orderBook.bids]
  );

  const maxAskTotal = useMemo(() => 
    Math.max(...orderBook.asks.map(a => a.amount), 1),
    [orderBook.asks]
  );

  const formatPrice = (price: number) => price.toFixed(6);
  const formatAmount = (amount: number) => {
    if (amount >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(2) + 'K';
    return amount.toFixed(2);
  };

  const spreadAmount = orderBook.asks[0]?.price && orderBook.bids[0]?.price
    ? orderBook.asks[0].price - orderBook.bids[0].price
    : 0;
  
  const spreadPercent = orderBook.bids[0]?.price
    ? ((spreadAmount / orderBook.bids[0].price) * 100).toFixed(3)
    : '0.000';

  return (
    <div className="h-[500px] flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 px-3 py-2 text-xs text-surface-400 uppercase tracking-wider border-b border-surface-800">
        <span>Price (GO)</span>
        <span className="text-right">Amount (RWA)</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (Sell Orders) - Reversed to show lowest at bottom */}
      <div className="flex-1 overflow-hidden flex flex-col-reverse">
        <AnimatePresence mode="popLayout">
          {orderBook.asks.slice(0, 10).map((ask, index) => {
            const depthPercent = (ask.amount / maxAskTotal) * 100;
            return (
              <motion.div
                key={`ask-${ask.price}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="order-row relative group"
              >
                <div 
                  className="depth-bar bg-accent-red" 
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="text-accent-red tabular-nums relative">
                  {formatPrice(ask.price)}
                </span>
                <span className="text-right tabular-nums text-surface-300 relative">
                  {formatAmount(ask.amount)}
                </span>
                <span className="text-right tabular-nums text-surface-500 relative">
                  {formatAmount(ask.amount * ask.price)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Spread */}
      <div className="py-3 px-3 bg-surface-900/50 border-y border-surface-800">
        <div className="flex items-center justify-between">
          <span className="text-surface-400 text-sm">Spread</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm">
              {formatPrice(spreadAmount)}
            </span>
            <span className="text-surface-500 text-xs">
              ({spreadPercent}%)
            </span>
          </div>
        </div>
        {/* Mid Price */}
        <div className="flex items-center justify-center mt-2">
          <span className={`text-xl font-mono font-bold tabular-nums ${
            (market?.change24h || 0) >= 0 ? 'text-accent-green' : 'text-accent-red'
          }`}>
            ${formatPrice(market?.lastPrice || 0)}
          </span>
        </div>
      </div>

      {/* Bids (Buy Orders) */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {orderBook.bids.slice(0, 10).map((bid, index) => {
            const depthPercent = (bid.amount / maxBidTotal) * 100;
            return (
              <motion.div
                key={`bid-${bid.price}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="order-row relative group"
              >
                <div 
                  className="depth-bar bg-accent-green" 
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="text-accent-green tabular-nums relative">
                  {formatPrice(bid.price)}
                </span>
                <span className="text-right tabular-nums text-surface-300 relative">
                  {formatAmount(bid.amount)}
                </span>
                <span className="text-right tabular-nums text-surface-500 relative">
                  {formatAmount(bid.amount * bid.price)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

