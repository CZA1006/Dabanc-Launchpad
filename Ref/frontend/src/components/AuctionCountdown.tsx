"use client";

import { useState, useEffect } from "react";
import { useMarketStore } from "@/store/marketStore";
import { motion } from "framer-motion";
import { Clock, Timer, Flame } from "lucide-react";

export function AuctionCountdown() {
  const { market } = useMarketStore();
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
    total: 0,
  });
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const calculateTimeLeft = () => {
      if (!market) return;

      const now = Date.now();
      const endTime = market.endTime;
      const startTime = market.startTime;
      const total = endTime - now;
      const totalDuration = endTime - startTime;

      if (total <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, total: 0 });
        setProgress(0);
        return;
      }

      setProgress((total / totalDuration) * 100);
      setTimeLeft({
        hours: Math.floor(total / (1000 * 60 * 60)),
        minutes: Math.floor((total % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((total % (1000 * 60)) / 1000),
        total,
      });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [market]);

  const formatNumber = (num: number) => String(num).padStart(2, "0");

  const isUrgent = timeLeft.hours < 1;

  return (
    <div className={`glass-card p-6 relative overflow-hidden ${isUrgent ? 'border-accent-red/50' : ''}`}>
      {/* Background glow effect */}
      <div 
        className={`absolute inset-0 opacity-10 ${isUrgent ? 'bg-accent-red' : 'bg-primary-500'}`}
        style={{
          clipPath: `inset(0 ${100 - progress}% 0 0)`,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative">
        <div className="flex items-center gap-2">
          {isUrgent ? (
            <Flame className="text-accent-red animate-pulse" size={20} />
          ) : (
            <Clock className="text-primary-400" size={20} />
          )}
          <h3 className="font-semibold">Auction Ends In</h3>
        </div>
        <div className={`text-xs px-2 py-1 rounded-full ${
          isUrgent 
            ? 'bg-accent-red/20 text-accent-red' 
            : 'bg-primary-500/20 text-primary-400'
        }`}>
          {isUrgent ? '🔥 Ending Soon!' : '⏳ Active'}
        </div>
      </div>

      {/* Countdown */}
      <div className="flex items-center justify-center gap-2 relative">
        {/* Hours */}
        <motion.div 
          key={`hours-${timeLeft.hours}`}
          initial={{ scale: 1.1, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className={`text-4xl font-display font-bold tabular-nums ${
            isUrgent ? 'text-accent-red' : 'text-white'
          }`}>
            {formatNumber(timeLeft.hours)}
          </div>
          <div className="text-xs text-surface-400 uppercase tracking-wider">Hours</div>
        </motion.div>

        <span className={`text-3xl font-bold ${isUrgent ? 'text-accent-red animate-pulse' : 'text-surface-500'}`}>:</span>

        {/* Minutes */}
        <motion.div 
          key={`minutes-${timeLeft.minutes}`}
          initial={{ scale: 1.1, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className={`text-4xl font-display font-bold tabular-nums ${
            isUrgent ? 'text-accent-red' : 'text-white'
          }`}>
            {formatNumber(timeLeft.minutes)}
          </div>
          <div className="text-xs text-surface-400 uppercase tracking-wider">Mins</div>
        </motion.div>

        <span className={`text-3xl font-bold ${isUrgent ? 'text-accent-red animate-pulse' : 'text-surface-500'}`}>:</span>

        {/* Seconds */}
        <motion.div 
          key={`seconds-${timeLeft.seconds}`}
          initial={{ scale: 1.1, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className={`text-4xl font-display font-bold tabular-nums ${
            isUrgent ? 'text-accent-red' : 'text-white'
          }`}>
            {formatNumber(timeLeft.seconds)}
          </div>
          <div className="text-xs text-surface-400 uppercase tracking-wider">Secs</div>
        </motion.div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 relative">
        <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              isUrgent 
                ? 'bg-gradient-to-r from-accent-red to-orange-500' 
                : 'bg-gradient-to-r from-primary-600 to-primary-400'
            }`}
            initial={{ width: '100%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-surface-500">
          <span>Start</span>
          <span>{progress.toFixed(1)}% remaining</span>
          <span>End</span>
        </div>
      </div>
    </div>
  );
}

