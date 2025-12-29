import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { useBalanceStore } from "./balanceStore";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3003";

interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

interface OrderLevel {
  price: number;
  amount: number;
  orders: number;
}

interface OrderBookData {
  bids: OrderLevel[];
  asks: OrderLevel[];
  timestamp: number;
}

interface Trade {
  id: string;
  marketId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyer: string;
  seller: string;
  price: number;
  amount: number;
  timestamp: number;
}

interface Order {
  id: string;
  marketId: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  filled: number;
  status: string;
  userAddress: string;
  timestamp: number;
}

interface Market {
  id: string;
  baseToken: string;
  quoteToken: string;
  startTime: number;
  endTime: number;
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
}

interface MarketState {
  socket: Socket | null;
  connected: boolean;
  market: Market | null;
  orderBook: OrderBookData;
  priceHistory: PricePoint[];
  recentTrades: Trade[];
  userOrders: Order[];
  isLoading: boolean;
  error: string | null;
  currentUserAddress: string | null; // 当前连接的钱包地址

  // Actions
  initializeSocket: () => void;
  disconnectSocket: () => void;
  subscribeToMarket: (marketId: string) => void;
  fetchPriceHistory: (marketId: string) => Promise<void>;
  fetchRecentTrades: (marketId: string) => Promise<void>;
  fetchUserOrders: (address: string) => Promise<void>;
  placeOrder: (order: {
    marketId: string;
    side: "buy" | "sell";
    price: number;
    amount: number;
    userAddress: string;
  }) => Promise<void>;
  cancelOrder: (orderId: string, userAddress: string) => Promise<void>;
  setCurrentUserAddress: (address: string | null) => void; // 设置当前用户地址
}

export const useMarketStore = create<MarketState>((set, get) => ({
  socket: null,
  connected: false,
  market: null,
  orderBook: { bids: [], asks: [], timestamp: 0 },
  priceHistory: [],
  recentTrades: [],
  userOrders: [],
  isLoading: false,
  error: null,
  currentUserAddress: null,

  setCurrentUserAddress: (address: string | null) => {
    set({ currentUserAddress: address });
  },

  initializeSocket: () => {
    if (get().socket) return;

    const socket = io(BACKEND_URL, {
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("Connected to order book server");
      set({ connected: true });
      
      // 自动订阅默认市场
      socket.emit("subscribe", "RWA-GO");
      
      // 获取初始数据
      get().fetchPriceHistory("RWA-GO");
      get().fetchRecentTrades("RWA-GO");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from order book server");
      set({ connected: false });
    });

    socket.on("orderbook", (data: OrderBookData) => {
      set({ orderBook: data });
    });

    socket.on("market", (data: Market) => {
      set({ market: data });
    });

    socket.on("trade", (trade: Trade) => {
      const currentAddress = get().currentUserAddress;
      
      // 更新交易列表和价格历史
      set((state) => ({
        recentTrades: [trade, ...state.recentTrades.slice(0, 49)],
        priceHistory: [
          ...state.priceHistory,
          {
            timestamp: trade.timestamp,
            price: trade.price,
            volume: trade.amount,
          },
        ],
      }));

      // 如果当前用户参与了这笔交易，更新余额
      if (currentAddress) {
        const normalizedAddress = currentAddress.toLowerCase();
        const isBuyer = trade.buyer.toLowerCase() === normalizedAddress;
        const isSeller = trade.seller.toLowerCase() === normalizedAddress;

        if (isBuyer || isSeller) {
          console.log(`📊 Trade matched! You are the ${isBuyer ? 'buyer' : 'seller'}`);
          console.log(`   Amount: ${trade.amount} RWA @ ${trade.price} GO`);
          
          // 更新余额 - 买方: -GO, +RWA; 卖方: +GO, -RWA
          const balanceStore = useBalanceStore.getState();
          if (isBuyer) {
            balanceStore.updateAfterTrade("buy", trade.price, trade.amount);
          } else {
            balanceStore.updateAfterTrade("sell", trade.price, trade.amount);
          }
        }
      }
    });

    socket.on("error", (error: string) => {
      set({ error });
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  subscribeToMarket: (marketId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit("subscribe", marketId);
    }
  },

  fetchPriceHistory: async (marketId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/prices/${marketId}?limit=288`);
      const data = await response.json();
      set({ priceHistory: data });
    } catch (error) {
      console.error("Failed to fetch price history:", error);
    }
  },

  fetchRecentTrades: async (marketId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/trades/${marketId}?limit=50`);
      const data = await response.json();
      set({ recentTrades: data });
    } catch (error) {
      console.error("Failed to fetch recent trades:", error);
    }
  },

  fetchUserOrders: async (address: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/orders/user/${address}`);
      const data = await response.json();
      set({ userOrders: data });
    } catch (error) {
      console.error("Failed to fetch user orders:", error);
    }
  },

  placeOrder: async (order) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${BACKEND_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to place order");
      }

      // 刷新用户订单
      await get().fetchUserOrders(order.userAddress);
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  cancelOrder: async (orderId: string, userAddress: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to cancel order");
      }

      // 刷新用户订单
      await get().fetchUserOrders(userAddress);
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },
}));

