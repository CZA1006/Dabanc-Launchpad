/**
 * Wagmi 配置 - 支持本地 Anvil 和多 RPC 节点自动切换
 */

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, localhost } from 'wagmi/chains';
import { http, fallback } from 'wagmi';

// RPC 节点列表 (按优先级排序)
const SEPOLIA_RPC_URLS = [
  // Alchemy (推荐)
  'https://eth-sepolia.g.alchemy.com/v2/7ZfJVASJ7WiZ-cgcJq7Is',
  // 公共节点备用
  'https://rpc.sepolia.org',
  'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
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

export const config = getDefaultConfig({
  appName: 'DABANC Launchpad',
  projectId: 'YOUR_PROJECT_ID', // 从 WalletConnect Cloud 获取
  chains: [anvilChain, sepolia],
  transports: {
    // Anvil 本地网络
    [anvilChain.id]: http('http://127.0.0.1:8545'),
    // Sepolia 使用 fallback 策略，自动切换节点
    [sepolia.id]: fallback(
      SEPOLIA_RPC_URLS.map(url => http(url, {
        // 单个请求超时 10秒
        timeout: 10_000,
        // 批量请求间隔
        batch: {
          batchSize: 100,
          wait: 20,
        },
      }))
    ),
  },
  ssr: false, // 禁用 SSR，纯客户端渲染
});

// 导出链配置
export { sepolia, anvilChain };
