// ============================================
// Dabanc Launchpad - 合约配置
// ============================================

import { ACTIVE_NETWORK } from './wagmi';

// === 合约地址 (Sepolia Testnet) ===
export const SEPOLIA_AUCTION_ADDRESS = "0xe44f10e4b810BAcB6D96D8defB4A57733BCdB786" as const;
export const SEPOLIA_USDC_ADDRESS = "0x3c76fE5e109ACd229D7F24a630FFae27857538D6" as const;
export const SEPOLIA_TOKEN_ADDRESS = "0x8bA807C3198474E760A8E13D07E85E8806547206" as const;

// === 合约地址 (Hyperliquid Testnet) ===
export const HYPERLIQUID_AUCTION_ADDRESS = "0x486Aa6B62fdE90Fa76eC88F46f804B86e45717E8" as const;
export const HYPERLIQUID_USDC_ADDRESS = "0xE0F68e6256B137CF2535A0b03f3dd521f6Dcb35E" as const;
export const HYPERLIQUID_TOKEN_ADDRESS = "0xCBF2B74008fD4E76f5b0334313d51aC2AffA6248" as const;
export const HYPERLIQUID_VAULT_ADDRESS = "0x36008222f59b2CAe99e6a969DB5332af5e4367A0" as const;

// === 本地开发地址 (Anvil) ===
export const LOCAL_AUCTION_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const LOCAL_USDC_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const LOCAL_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// 🔧 根据当前激活网络自动选择合约地址
const getContractAddresses = () => {
  switch (ACTIVE_NETWORK) {
    case 'hyperliquid':
      return {
        AUCTION: HYPERLIQUID_AUCTION_ADDRESS,
        USDC: HYPERLIQUID_USDC_ADDRESS,
        TOKEN: HYPERLIQUID_TOKEN_ADDRESS,
      };
    case 'local':
      return {
        AUCTION: LOCAL_AUCTION_ADDRESS,
        USDC: LOCAL_USDC_ADDRESS,
        TOKEN: LOCAL_TOKEN_ADDRESS,
      };
    case 'sepolia':
    default:
      return {
        AUCTION: SEPOLIA_AUCTION_ADDRESS,
        USDC: SEPOLIA_USDC_ADDRESS,
        TOKEN: SEPOLIA_TOKEN_ADDRESS,
      };
  }
};

const addresses = getContractAddresses();

// 导出当前网络的合约地址 (向后兼容)
export const AUCTION_ADDRESS = addresses.AUCTION;
export const USDC_ADDRESS = addresses.USDC;
export const TOKEN_ADDRESS = addresses.TOKEN;

// 🌟 CEX 服务器地址 (指向本地运行的 server.ts)
export const API_URL = "http://localhost:3001";

// === 网络配置 ===
const NETWORK_EXPLORERS = {
  sepolia: "https://sepolia.etherscan.io",
  hyperliquid: "https://explorer.hyperliquid-testnet.xyz",
  local: "http://localhost:8545",
} as const;

// === 项目配置 ===
export const PROJECT_CONFIG = {
  name: "SpaceX Equity",
  symbol: "wSPX",
  description: "SpaceX 股权代币化发行，参与太空商业化未来",
  totalSupply: 10_000_000,
  supplyPerRound: 500,
  roundDuration: 300, // 5 minutes
  greenShoeRatio: 0.15, // 15%
  
  // 链接
  website: "https://spacex.com",
  whitepaper: "/whitepaper.pdf",
  audit: "/audit-report.pdf",
  explorer: NETWORK_EXPLORERS[ACTIVE_NETWORK] || NETWORK_EXPLORERS.sepolia,
  
  // 社交
  twitter: "https://twitter.com/spacex",
  discord: "https://discord.gg/dabanc",
  
  // 当前网络信息
  network: ACTIVE_NETWORK,
  networkName: ACTIVE_NETWORK === 'hyperliquid' ? 'Hyperliquid Testnet' : 
               ACTIVE_NETWORK === 'local' ? 'Local Anvil' : 'Sepolia Testnet',
} as const;

// === 拍卖阶段枚举 ===
export enum AuctionPhase {
  PREVIEW = "PREVIEW",     // 预热期
  BIDDING = "BIDDING",     // 竞拍期
  CLEARING = "CLEARING",   // 清算期
  SETTLEMENT = "SETTLEMENT", // 结算期
}

// === 拍卖合约 ABI ===
export const AUCTION_ABI = [
  // --- 资金管理 ---
  {
    inputs: [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{"internalType": "address", "name": "", "type": "address"}],
    name: "userBalances",
    outputs: [{"internalType": "uint256", "name": "", "type": "uint256"}],
    stateMutability: "view",
    type: "function"
  },
  // 🌟 新增：用户 RWA Token 托管余额
  {
    inputs: [{"internalType": "address", "name": "", "type": "address"}],
    name: "userTokenBalances",
    outputs: [{"internalType": "uint256", "name": "", "type": "uint256"}],
    stateMutability: "view",
    type: "function"
  },
  // 🌟 新增：提取 RWA Token 到外部钱包
  {
    inputs: [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    name: "withdrawTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  // --- 写入函数 ---
  {
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "_limitPrice", type: "uint256" }
    ],
    name: "placeBid",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "roundId", type: "uint256" }],
    name: "claimTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "roundId", type: "uint256" }],
    name: "claimRefund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "startNextRound",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  
  // --- 读取函数 ---
  {
    inputs: [],
    name: "currentRoundId",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "lastClearingTime",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "isRoundActive",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getRemainingTime",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "roundId", type: "uint256" }],
    name: "rounds",
    outputs: [
      { name: "totalBidAmount", type: "uint256" }, // 注意：这里的字段名可能需要根据你的合约实际返回值调整，如果合约返回的是tuple，ethers会自动解析
      { name: "clearingPrice", type: "uint256" },
      { name: "totalTokensSold", type: "uint256" },
      { name: "isCleared", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "user", type: "address" }
    ],
    name: "getUserBidDetails",
    outputs: [
      { name: "totalAmount", type: "uint256" },
      { name: "tokensAllocated", type: "uint256" },
      { name: "refundAmount", type: "uint256" },
      { name: "hasClaimed", type: "bool" },
      { name: "hasRefunded", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "roundId", type: "uint256" }],
    name: "getRoundParticipantCount",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "user", type: "address" }
    ],
    name: "userBids",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "isWhitelisted",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  
  // --- 事件 ---
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "roundId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "limitPrice", type: "uint256" }
    ],
    name: "BidPlaced",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "roundId", type: "uint256" },
      { indexed: false, name: "clearingPrice", type: "uint256" },
      { indexed: false, name: "totalVolume", type: "uint256" }
    ],
    name: "RoundCleared",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "roundId", type: "uint256" },
      { indexed: false, name: "startTime", type: "uint256" }
    ],
    name: "RoundStarted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "roundId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "tokenAmount", type: "uint256" }
    ],
    name: "TokensClaimed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "roundId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "refundAmount", type: "uint256" }
    ],
    name: "RefundClaimed",
    type: "event"
  },
  
  // --- 动态供应量查询函数 ---
  {
    inputs: [],
    name: "getSupplyStats",
    outputs: [
      { name: "total", type: "uint256" },
      { name: "issued", type: "uint256" },
      { name: "remaining", type: "uint256" },
      { name: "currentRound", type: "uint256" },
      { name: "progress", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getDynamicSupplyConfig",
    outputs: [
      { name: "target", type: "uint256" },
      { name: "step", type: "uint256" },
      { name: "tolerance", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  
  // --- 管理员函数 (仅限 owner) ---
  {
    inputs: [],
    name: "withdrawProceeds",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getAvailableProceeds",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// === USDC 合约 ABI ===
export const USDC_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// === 错误信息映射 (友好提示) ===
export const ERROR_MESSAGES: Record<string, string> = {
  "User denied": "您取消了交易请求",
  "User rejected": "您拒绝了交易签名",
  "insufficient funds": "账户 ETH 余额不足以支付 Gas 费用",
  "insufficient allowance": "USDC 授权额度不足，请先点击 Approve",
  "KYCRequired": "您尚未通过 KYC 认证，无法参与竞拍",
  "RoundNotActive": "当前轮次已结束，请等待下一轮开始",
  "RoundTimeExpired": "竞拍时间已到，正在等待清算",
  "InvalidAmount": "出价金额无效，请输入大于 0 的数值",
  "InvalidPrice": "限价无效，请输入大于 0 的价格",
  "AlreadyClaimed": "您已经领取过代币了",
  "NothingToClaim": "没有可领取的代币或退款",
  "execution reverted": "交易执行失败，请检查参数",
  "nonce too low": "交易 Nonce 冲突，请刷新页面重试",
  "replacement fee too low": "Gas 价格过低，交易可能卡住",
  "network changed": `检测到网络切换，请确认您在 ${ACTIVE_NETWORK === 'hyperliquid' ? 'Hyperliquid' : ACTIVE_NETWORK === 'local' ? 'Local' : 'Sepolia'} 测试网`,
  "InsufficientBalance": "平台账户余额不足，请先充值", // 补充 CEX 模式错误
};

// === 获取友好错误信息 ===
export function getFriendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  
  for (const [key, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return friendly;
    }
  }
  
  // 默认错误
  if (message.length > 100) {
    return "交易失败，请稍后重试";
  }
  
  return message;
}

// === 格式化工具 ===
export const formatters = {
  // 格式化价格 (保留4位小数)
  price: (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0.0000';
    return num.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 4 
    });
  },
  
  // 格式化金额 (千分位)
  amount: (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  },
  
  // 格式化地址 (缩略)
  address: (address: string): string => {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  },
  
  // 格式化时间倒计时
  countdown: (seconds: number): string => {
    if (seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },
  
  // 格式化百分比
  percent: (value: number): string => {
    return `${(value * 100).toFixed(2)}%`;
  },
  
  // 相对时间
  relativeTime: (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 1000) return '刚刚';
    if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  }
};