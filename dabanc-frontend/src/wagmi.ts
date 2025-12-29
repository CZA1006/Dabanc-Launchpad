/**
 * Wagmi 配置 - 支持本地 Anvil、Sepolia 和 Hyperliquid 测试网
 */

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, localhost } from 'wagmi/chains';
import { http, fallback } from 'wagmi';
import { defineChain } from 'viem';

// RPC 节点列表 (按优先级排序)
// 注意: Alchemy 免费版有区块范围限制，优先使用公共节点获取事件
const SEPOLIA_RPC_URLS = [
  // 公共节点（无区块范围限制）
  'https://rpc.sepolia.org',
  'https://ethereum-sepolia-rpc.publicnode.com',
  // Alchemy 备用
  'https://eth-sepolia.g.alchemy.com/v2/dEeXnxTpz5ERH4wuevD9f',
];

// Anvil 本地节点配置
const anvilChain = {
  ...localhost,
  id: 31337,
  name: 'Anvil Local',
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
};

// 🌟 Hyperliquid 测试网 (HyperEVM Testnet) 配置
export const hyperliquidTestnet = defineChain({
  id: 998,
  name: 'Hyperliquid Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'HYPE',
    symbol: 'HYPE',
  },
  rpcUrls: {
    default: { 
      http: ['https://rpc.hyperliquid-testnet.xyz/evm'] 
    },
    public: { 
      http: ['https://rpc.hyperliquid-testnet.xyz/evm'] 
    },
  },
  blockExplorers: {
    default: { 
      name: 'Hyperliquid Explorer', 
      url: 'https://explorer.hyperliquid-testnet.xyz' 
    },
  },
  testnet: true,
});

// 🔧 当前激活的网络 - 修改这里可以切换网络
// 可选值: 'sepolia' | 'hyperliquid' | 'local'
export type NetworkType = 'sepolia' | 'hyperliquid' | 'local';
export const ACTIVE_NETWORK: NetworkType = 'hyperliquid';

// 根据激活网络决定链配置
const getChainConfig = (network: NetworkType) => {
  switch (network) {
    case 'hyperliquid':
      // Hyperliquid 测试网作为默认
      return {
        chains: [hyperliquidTestnet, sepolia, anvilChain] as const,
        transports: {
          [hyperliquidTestnet.id]: http('https://rpc.hyperliquid-testnet.xyz/evm', {
            timeout: 15_000,
            retryCount: 3,
          }),
          [sepolia.id]: fallback(
            SEPOLIA_RPC_URLS.map(url => http(url, {
              timeout: 10_000,
              batch: { batchSize: 100, wait: 20 },
            }))
          ),
          [anvilChain.id]: http('http://127.0.0.1:8545'),
        },
      };
    case 'local':
      return {
        chains: [anvilChain, sepolia, hyperliquidTestnet] as const,
        transports: {
          [anvilChain.id]: http('http://127.0.0.1:8545'),
          [sepolia.id]: fallback(
            SEPOLIA_RPC_URLS.map(url => http(url, {
              timeout: 10_000,
              batch: { batchSize: 100, wait: 20 },
            }))
          ),
          [hyperliquidTestnet.id]: http('https://rpc.hyperliquid-testnet.xyz/evm'),
        },
      };
    case 'sepolia':
    default:
      return {
        chains: [sepolia, hyperliquidTestnet, anvilChain] as const,
        transports: {
          [sepolia.id]: fallback(
            SEPOLIA_RPC_URLS.map(url => http(url, {
              timeout: 10_000,
              batch: { batchSize: 100, wait: 20 },
            }))
          ),
          [hyperliquidTestnet.id]: http('https://rpc.hyperliquid-testnet.xyz/evm'),
          [anvilChain.id]: http('http://127.0.0.1:8545'),
        },
      };
  }
};

const chainConfig = getChainConfig(ACTIVE_NETWORK);

export const config = getDefaultConfig({
  appName: 'DABANC Launchpad',
  projectId: 'YOUR_PROJECT_ID', // 从 WalletConnect Cloud 获取
  chains: chainConfig.chains,
  transports: chainConfig.transports,
  ssr: false, // 禁用 SSR，纯客户端渲染
});

// 导出链配置
export { sepolia, anvilChain };
