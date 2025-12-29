"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useMarketStore } from "@/store/marketStore";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { X, ExternalLink, Wallet } from "lucide-react";

export function UserOrders() {
  const { address, isConnected } = useAccount();
  const { userOrders, fetchUserOrders, cancelOrder } = useMarketStore();

  useEffect(() => {
    if (address) {
      fetchUserOrders(address);
      // 定期刷新
      const interval = setInterval(() => fetchUserOrders(address), 10000);
      return () => clearInterval(interval);
    }
  }, [address, fetchUserOrders]);

  const formatPrice = (price: number) => price.toFixed(6);
  const formatAmount = (amount: number) => amount.toFixed(2);

  const handleCancel = async (orderId: string) => {
    if (!address) return;
    try {
      await cancelOrder(orderId, address);
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-surface-500">
        <Wallet className="mb-3" size={32} />
        <p>Connect wallet to view your orders</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-7 gap-4 px-4 py-3 text-xs text-surface-400 uppercase tracking-wider border-b border-surface-800">
        <span>Time</span>
        <span>Pair</span>
        <span>Type</span>
        <span className="text-right">Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Filled</span>
        <span className="text-right">Action</span>
      </div>

      {/* Orders List */}
      <div className="max-h-[300px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {userOrders.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-surface-500">
              No open orders
            </div>
          ) : (
            userOrders.map((order) => {
              const filledPercent = (order.filled / order.amount) * 100;
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="grid grid-cols-7 gap-4 px-4 py-3 text-sm font-mono hover:bg-surface-800/50 
                           transition-colors border-b border-surface-900/50 items-center"
                >
                  {/* Time */}
                  <span className="text-surface-400 text-xs">
                    {format(new Date(order.timestamp), 'MM/dd HH:mm')}
                  </span>
                  
                  {/* Pair */}
                  <span className="text-surface-300">
                    RWA/GO
                  </span>

                  {/* Type */}
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    order.side === 'buy' 
                      ? 'bg-accent-green/20 text-accent-green'
                      : 'bg-accent-red/20 text-accent-red'
                  }`}>
                    {order.side.toUpperCase()}
                  </span>

                  {/* Price */}
                  <span className={`text-right tabular-nums ${
                    order.side === 'buy' ? 'text-accent-green' : 'text-accent-red'
                  }`}>
                    {formatPrice(order.price)}
                  </span>

                  {/* Amount */}
                  <span className="text-right tabular-nums text-surface-300">
                    {formatAmount(order.amount)}
                  </span>

                  {/* Filled */}
                  <div className="text-right">
                    <span className="tabular-nums text-surface-300">
                      {filledPercent.toFixed(1)}%
                    </span>
                    <div className="w-full h-1 bg-surface-800 rounded-full mt-1">
                      <div 
                        className={`h-full rounded-full ${
                          order.side === 'buy' ? 'bg-accent-green' : 'bg-accent-red'
                        }`}
                        style={{ width: `${filledPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleCancel(order.id)}
                      className="p-1.5 text-surface-400 hover:text-accent-red hover:bg-accent-red/20 
                               rounded-lg transition-colors"
                      title="Cancel Order"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Summary */}
      {userOrders.length > 0 && (
        <div className="border-t border-surface-800 p-4 bg-surface-900/30">
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">
              {userOrders.length} open order(s)
            </span>
            <div className="flex gap-4">
              <span className="text-accent-green">
                Buy: {userOrders.filter(o => o.side === 'buy').length}
              </span>
              <span className="text-accent-red">
                Sell: {userOrders.filter(o => o.side === 'sell').length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

