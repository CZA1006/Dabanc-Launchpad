// 1. 新的合约地址 (Sepolia)
export const AUCTION_ADDRESS = "0xc9AeBb8D366113383BB243bD9299b3392C30421c"; // ✅ 保持不变
export const USDC_ADDRESS = "0x412E1Aa8223e17eC4b64F63C26D5B7E032B67Fbf";    // ✅ 保持不变

// 2. 升级版 ABI (已补全 lastClearingTime)
export const AUCTION_ABI = [
  // 下单函数
  {
    "inputs": [
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {"internalType": "uint256", "name": "_limitPrice", "type": "uint256"}
    ],
    "name": "placeBid",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // 事件监听
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "uint256", "name": "roundId", "type": "uint256"},
      {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "limitPrice", "type": "uint256"}
    ],
    "name": "BidPlaced",
    "type": "event"
  },
  // === 基础读取函数 ===
  {
    "inputs": [],
    "name": "currentRoundId",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  // 🌟 关键修复：补上 lastClearingTime，否则前端倒计时无法同步
  {
    "inputs": [],
    "name": "lastClearingTime",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "name": "rounds",
    "outputs": [
      {"internalType": "uint256", "name": "totalBidAmount", "type": "uint256"},
      {"internalType": "uint256", "name": "clearingPrice", "type": "uint256"},
      {"internalType": "bool", "name": "isCleared", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // === 管理员控制函数 ===
  {
    "inputs": [],
    "name": "isRoundActive",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "startNextRound",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const USDC_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "to", "type": "address"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;