import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// 检查环境变量是否设置，如果没有则使用空字符串避免报错（但部署会失败）
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const HYPERLIQUID_RPC_URL = process.env.HYPERLIQUID_RPC_URL || "https://rpc.hyperliquid-testnet.xyz/evm";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // 本地网络 (默认)
    hardhat: {},
    // Sepolia 测试网
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    // Hyperliquid 测试网 (HyperEVM Testnet)
    hyperliquid_testnet: {
      url: HYPERLIQUID_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 998,
      gasPrice: 1000000000, // 1 gwei - Hyperliquid 使用较低的 gas 价格
    },
  },
  // 可选：Etherscan 验证配置 (以后用于源码认证)
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "YOUR_ETHERSCAN_API_KEY",
      // Hyperliquid 目前没有 Etherscan 类似的验证服务
    },
    customChains: [
      {
        network: "hyperliquid_testnet",
        chainId: 998,
        urls: {
          apiURL: "https://explorer.hyperliquid-testnet.xyz/api",
          browserURL: "https://explorer.hyperliquid-testnet.xyz",
        },
      },
    ],
  },
};

export default config;