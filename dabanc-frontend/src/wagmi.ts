import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { http } from 'wagmi';

export const config = getDefaultConfig({
  appName: 'DABANC Launchpad',
  projectId: 'YOUR_PROJECT_ID', 
  chains: [sepolia],
  transports: {
    // 强制使用您的 Alchemy 专属节点，这是最稳的解决方案
    [sepolia.id]: http('https://eth-sepolia.g.alchemy.com/v2/7ZfJVASJ7WiZ-cgcJq7Is'),
  },
  ssr: true,
});