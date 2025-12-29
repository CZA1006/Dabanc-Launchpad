"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import { TradingChart } from "@/components/TradingChart";
import { OrderBook } from "@/components/OrderBook";
import { TradeForm } from "@/components/TradeForm";
import { RecentTrades } from "@/components/RecentTrades";
import { MarketInfo } from "@/components/MarketInfo";
import { AuctionCountdown } from "@/components/AuctionCountdown";
import { UserOrders } from "@/components/UserOrders";
import { WalletPanel } from "@/components/WalletPanel";
import { useMarketStore } from "@/store/marketStore";
import { motion } from "framer-motion";

export default function Home() {
  const { initializeSocket, market, setCurrentUserAddress } = useMarketStore();
  const { address, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    initializeSocket();
  }, [initializeSocket]);

  // 当钱包连接状态变化时，更新 marketStore 中的用户地址
  useEffect(() => {
    if (isConnected && address) {
      setCurrentUserAddress(address);
    } else {
      setCurrentUserAddress(null);
    }
  }, [address, isConnected, setCurrentUserAddress]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary-500">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <Header />
      
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Market Info & Countdown */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-2">
            <MarketInfo />
          </div>
          <div>
            <AuctionCountdown />
          </div>
        </motion.div>

        {/* Main Trading Interface */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Chart */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="xl:col-span-8 glass-card p-4"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary-400">📈</span> Price Chart
            </h2>
            <TradingChart />
          </motion.div>

          {/* Order Book */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="xl:col-span-4 glass-card p-4"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary-400">📊</span> Order Book
            </h2>
            <OrderBook />
          </motion.div>
        </div>

        {/* Wallet, Trade Form & Recent Trades */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Wallet Panel */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <WalletPanel />
          </motion.div>

          {/* Trade Form */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-card p-6"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary-400">💹</span> Place Order
            </h2>
            <TradeForm />
          </motion.div>

          {/* Recent Trades */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-card p-4"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary-400">⏱️</span> Recent Trades
            </h2>
            <RecentTrades />
          </motion.div>
        </div>

        {/* User Orders */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-4"
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="text-primary-400">📋</span> My Orders
          </h2>
          <UserOrders />
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-surface-800/50 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-surface-500 text-sm">
          <p>RWA Launchpad - Off-chain Order Matching, On-chain Settlement</p>
          <p className="mt-2 text-surface-600">
            ⚡ Powered by Ethereum | 🔒 Secure & Transparent
          </p>
        </div>
      </footer>
    </main>
  );
}

