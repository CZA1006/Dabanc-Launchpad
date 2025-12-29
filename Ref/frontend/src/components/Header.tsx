"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMarketStore } from "@/store/marketStore";
import { motion } from "framer-motion";

export function Header() {
  const { connected, market } = useMarketStore();

  return (
    <header className="border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xl font-bold shadow-lg shadow-primary-500/30">
              R
            </div>
            <div>
              <h1 className="font-display font-bold text-lg">RWA Launchpad</h1>
              <p className="text-xs text-surface-400">Trade Real World Assets</p>
            </div>
          </motion.div>

          {/* Center - Market Pair */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden md:flex items-center gap-4"
          >
            <div className="glass-button px-4 py-2 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold">
                  R
                </div>
                <span className="font-semibold">RWA</span>
              </div>
              <span className="text-surface-500">/</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-xs font-bold">
                  $
                </div>
                <span className="font-semibold">GO</span>
              </div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-accent-green animate-pulse' : 'bg-accent-red'}`} />
              <span className="text-surface-400">
                {connected ? 'Live' : 'Disconnected'}
              </span>
            </div>
          </motion.div>

          {/* Right - Connect Wallet */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <ConnectButton 
              showBalance={true}
              chainStatus="icon"
              accountStatus={{
                smallScreen: 'avatar',
                largeScreen: 'full',
              }}
            />
          </motion.div>
        </div>
      </div>
    </header>
  );
}

