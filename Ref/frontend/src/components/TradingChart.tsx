"use client";

import { useMarketStore } from "@/store/marketStore";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { format } from "date-fns";
import { useState } from "react";

const timeframes = [
  { label: "1H", value: 12 },
  { label: "4H", value: 48 },
  { label: "12H", value: 144 },
  { label: "24H", value: 288 },
];

export function TradingChart() {
  const { priceHistory, market } = useMarketStore();
  const [selectedTimeframe, setSelectedTimeframe] = useState(288);

  const chartData = priceHistory.slice(-selectedTimeframe).map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), "HH:mm"),
    fullTime: format(new Date(point.timestamp), "MM/dd HH:mm"),
  }));

  const isPositive = chartData.length >= 2 
    ? chartData[chartData.length - 1]?.price >= chartData[0]?.price 
    : true;

  const gradientColor = isPositive ? "#22c55e" : "#ef4444";
  const strokeColor = isPositive ? "#22c55e" : "#ef4444";

  const minPrice = Math.min(...chartData.map(d => d.price)) * 0.995;
  const maxPrice = Math.max(...chartData.map(d => d.price)) * 1.005;

  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      value: number;
      payload: {
        fullTime: string;
        volume: number;
      };
    }>;
  }

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="text-surface-400 text-xs">{payload[0].payload.fullTime}</p>
          <p className={`font-mono font-semibold ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
            ${payload[0].value.toFixed(6)}
          </p>
          <p className="text-surface-500 text-xs">
            Vol: {payload[0].payload.volume.toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[400px]">
      {/* Timeframe Selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setSelectedTimeframe(tf.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                selectedTimeframe === tf.value
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                  : 'text-surface-400 hover:text-white hover:bg-surface-800'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-surface-500">
          {chartData.length} data points
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientColor} stopOpacity={0.3} />
              <stop offset="50%" stopColor={gradientColor} stopOpacity={0.1} />
              <stop offset="100%" stopColor={gradientColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#27272a" 
            vertical={false}
          />
          <XAxis
            dataKey="time"
            stroke="#52525b"
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            stroke="#52525b"
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value.toFixed(3)}`}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="price"
            stroke={strokeColor}
            strokeWidth={2}
            fill="url(#priceGradient)"
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

