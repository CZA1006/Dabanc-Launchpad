/**
 * Wagmi 配置 - 支持本地 Anvil 和多 RPC 节点自动切换
 */

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, localhost } from 'wagmi/chains';
import { http, fallback } from 'wagmi';

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

export const config = getDefaultConfig({
  appName: 'DABANC Launchpad',
  projectId: 'YOUR_PROJECT_ID', // 从 WalletConnect Cloud 获取
  // ⚠️ Sepolia 放在第一位，作为默认网络
  chains: [sepolia, anvilChain],
  transports: {
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
    // Anvil 本地网络（可选）
    [anvilChain.id]: http('http://127.0.0.1:8545'),
  },
  ssr: false, // 禁用 SSR，纯客户端渲染
});

// 导出链配置
export { sepolia, anvilChain };
