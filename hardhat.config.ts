import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// 检查环境变量是否设置，如果没有则使用空字符串避免报错（但部署会失败）
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    // 本地网络 (默认)
    hardhat: {},
    // Sepolia 测试网
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  // 可选：Etherscan 验证配置 (以后用于源码认证)
  etherscan: {
    apiKey: "YOUR_ETHERSCAN_API_KEY", 
  },
};

export default config;