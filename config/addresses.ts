/**
 * @file addresses.ts
 * @description 统一的合约地址配置文件
 * @notice 所有脚本应从此文件导入地址，避免硬编码重复
 */

import * as dotenv from "dotenv";
dotenv.config();

/**
 * 网络配置
 */
export const NETWORKS = {
  hardhat: {
    chainId: 31337,
    name: "Hardhat Local",
    explorer: "http://localhost:8545",
  },
  sepolia: {
    chainId: 11155111,
    name: "Sepolia Testnet",
    explorer: "https://sepolia.etherscan.io",
  },
  hyperliquid_testnet: {
    chainId: 998,
    name: "Hyperliquid Testnet",
    explorer: "https://explorer.hyperliquid-testnet.xyz",
  },
  mainnet: {
    chainId: 1,
    name: "Ethereum Mainnet",
    explorer: "https://etherscan.io",
  },
} as const;

// 当前激活的网络 (从环境变量读取，默认 hyperliquid_testnet)
export const ACTIVE_NETWORK = (process.env.HARDHAT_NETWORK || "hyperliquid_testnet") as keyof typeof NETWORKS;

/**
 * 获取当前网络的区块浏览器 URL
 */
export function getExplorerUrl(txHash?: string): string {
  const network = NETWORKS[ACTIVE_NETWORK] || NETWORKS.hyperliquid_testnet;
  if (txHash) {
    return `${network.explorer}/tx/${txHash}`;
  }
  return network.explorer;
}

/**
 * 合约地址 - 从环境变量读取
 * 在 .env 文件中配置这些地址
 */
export const ADDRESSES = {
  // 拍卖合约
  auction: process.env.AUCTION_ADDRESS || "",
  
  // 支付代币 (USDC)
  usdc: process.env.USDC_ADDRESS || "",
  
  // 拍卖代币 (如 wSPX) - 支持两种命名
  auctionToken: process.env.TOKEN_ADDRESS || process.env.AUCTION_TOKEN_ADDRESS || "",
  
  // 绿鞋金库 - 支持两种命名
  greenShoeVault: process.env.VAULT_ADDRESS || process.env.GREEN_SHOE_VAULT_ADDRESS || "",
} as const;

/**
 * 验证地址是否已配置
 */
export function validateAddresses(): boolean {
  const missingAddresses: string[] = [];
  
  if (!ADDRESSES.auction) missingAddresses.push("AUCTION_ADDRESS");
  if (!ADDRESSES.usdc) missingAddresses.push("USDC_ADDRESS");
  if (!ADDRESSES.auctionToken) missingAddresses.push("AUCTION_TOKEN_ADDRESS");
  
  if (missingAddresses.length > 0) {
    console.error("❌ 缺少以下环境变量配置:");
    missingAddresses.forEach((addr) => console.error(`   - ${addr}`));
    console.error("\n请在 .env 文件中配置这些地址");
    return false;
  }
  
  return true;
}

/**
 * 获取地址并验证
 */
export function getAddress(key: keyof typeof ADDRESSES): string {
  const address = ADDRESSES[key];
  if (!address) {
    throw new Error(`地址未配置: ${key}. 请在 .env 文件中设置对应的环境变量。`);
  }
  return address;
}

/**
 * 打印当前配置的地址
 */
export function printAddresses(): void {
  console.log("\n📋 当前合约地址配置:");
  console.log("─".repeat(60));
  Object.entries(ADDRESSES).forEach(([key, value]) => {
    const status = value ? "✅" : "❌";
    const displayValue = value || "(未配置)";
    console.log(`${status} ${key.padEnd(20)} : ${displayValue}`);
  });
  console.log("─".repeat(60));
}

/**
 * Bot 配置
 */
export const BOT_CONFIG = {
  // 轮询间隔 (毫秒)
  pollingInterval: Number(process.env.BOT_POLLING_INTERVAL) || 2000,
  
  // 清算后等待时间 (毫秒)
  postClearingDelay: Number(process.env.BOT_POST_CLEARING_DELAY) || 5000,
  
  // 轮次持续时间 (秒)
  roundDuration: Number(process.env.ROUND_DURATION) || 300,
  
  // 每轮代币供应量
  tokenSupplyPerRound: Number(process.env.TOKEN_SUPPLY_PER_ROUND) || 500,
  
  // 最小清算价格
  minClearingPrice: Number(process.env.MIN_CLEARING_PRICE) || 0.01,
  
  // 最大清算价格
  maxClearingPrice: Number(process.env.MAX_CLEARING_PRICE) || 1000,
  
  // 🆕 清算后自动提款 (默认关闭)
  autoWithdraw: process.env.BOT_AUTO_WITHDRAW === "true",
} as const;

/**
 * 数据库配置
 */
export const DB_CONFIG = {
  // 数据库路径
  dbPath: process.env.DB_PATH || "./backend_db/orders.db",
  
  // 历史记录JSON路径
  historyPath: process.env.HISTORY_PATH || "./backend_db/history.json",
} as const;

export default {
  NETWORKS,
  ADDRESSES,
  BOT_CONFIG,
  DB_CONFIG,
  validateAddresses,
  getAddress,
  printAddresses,
};

