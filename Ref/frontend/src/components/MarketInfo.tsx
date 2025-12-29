"use client";

import { useMarketStore } from "@/store/marketStore";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart3 } from "lucide-react";

export function MarketInfo() {
  const { market } = useMarketStore();

  const formatNumber = (num: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const formatCurrency = (num: number) => {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    }
    return `$${formatNumber(num)}`;
  };

  const isPositive = (market?.change24h || 0) >= 0;

  return (
    <div className="glass-card p-6">
      <div className="flex flex-wrap items-center gap-8">
        {/* Price */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-baseline gap-3">
            <AnimatePresence mode="wait">
              <motion.span
                key={market?.lastPrice}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={`text-4xl font-display font-bold tabular-nums ${
                  isPositive ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                ${formatNumber(market?.lastPrice || 0, 4)}
              </motion.span>
            </AnimatePresence>
            <motion.span 
              className={`flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-lg ${
                isPositive 
                  ? 'bg-accent-green/20 text-accent-green' 
                  : 'bg-accent-red/20 text-accent-red'
              }`}
            >
              {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {isPositive ? '+' : ''}{formatNumber(market?.change24h || 0)}%
            </motion.span>
          </div>
          <p className="text-surface-400 text-sm mt-1">RWA / GO</p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-6">
          {/* 24h High */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
              <TrendingUp size={12} />
              24h High
            </div>
            <p className="font-mono font-semibold text-accent-green">
              ${formatNumber(market?.high24h || 0, 4)}
            </p>
          </div>

          {/* 24h Low */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
              <TrendingDown size={12} />
              24h Low
            </div>
            <p className="font-mono font-semibold text-accent-red">
              ${formatNumber(market?.low24h || 0, 4)}
            </p>
          </div>

          {/* 24h Volume */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
              <BarChart3 size={12} />
              24h Volume
            </div>
            <p className="font-mono font-semibold">
              {formatCurrency(market?.volume24h || 0)}
            </p>
          </div>

          {/* Spread Indicator */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-surface-400 text-xs mb-1">
              <Activity size={12} />
              Status
            </div>
            <p className="font-semibold text-accent-green flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
              Trading
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

