import { create } from "zustand";

interface BalanceState {
  // 链上合约中的余额（trading balance）
  goAvailable: number;
  goLocked: number;
  rwaAvailable: number;
  rwaLocked: number;
  
  // 钱包中的余额
  goWallet: number;
  rwaWallet: number;
  
  // 是否已加载
  isLoaded: boolean;
  
  // Actions
  setTradingBalance: (token: "GO" | "RWA", available: number, locked: number) => void;
  setWalletBalance: (token: "GO" | "RWA", amount: number) => void;
  updateAfterTrade: (side: "buy" | "sell", price: number, amount: number) => void;
  refreshAll: () => void;
  setLoaded: (loaded: boolean) => void;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  goAvailable: 0,
  goLocked: 0,
  rwaAvailable: 0,
  rwaLocked: 0,
  goWallet: 0,
  rwaWallet: 0,
  isLoaded: false,

  setTradingBalance: (token, available, locked) => {
    if (token === "GO") {
      set({ goAvailable: available, goLocked: locked });
    } else {
      set({ rwaAvailable: available, rwaLocked: locked });
    }
  },

  setWalletBalance: (token, amount) => {
    if (token === "GO") {
      set({ goWallet: amount });
    } else {
      set({ rwaWallet: amount });
    }
  },

  // 交易后更新余额（链下交易，立即更新本地状态）
  updateAfterTrade: (side, price, amount) => {
    const state = get();
    const total = price * amount;
    
    if (side === "buy") {
      // 买入 RWA：减少 GO，增加 RWA
      set({
        goAvailable: Math.max(0, state.goAvailable - total),
        rwaAvailable: state.rwaAvailable + amount,
      });
    } else {
      // 卖出 RWA：增加 GO，减少 RWA
      set({
        goAvailable: state.goAvailable + total,
        rwaAvailable: Math.max(0, state.rwaAvailable - amount),
      });
    }
  },

  refreshAll: () => {
    // 触发重新加载标志，让组件重新获取链上数据
    set({ isLoaded: false });
  },

  setLoaded: (loaded) => {
    set({ isLoaded: loaded });
  },
}));

