/**
 * Dabanc Launchpad - 入口文件
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { config } from './wagmi';
import App from './App';

// 引入样式
import '@rainbow-me/rainbowkit/styles.css';
import './index.css'; 

// Query Client 配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 失败后重试 3 次
      retry: 3,
      // 窗口聚焦时不自动刷新 (避免干扰用户)
      refetchOnWindowFocus: false,
      // 数据过期时间
      staleTime: 5000,
    },
  },
});

// 自定义 RainbowKit 深色主题
const customDarkTheme = darkTheme({
  accentColor: '#00d4ff',
  accentColorForeground: '#000',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

// 覆盖更多颜色
customDarkTheme.colors.connectButtonBackground = '#151c28';
customDarkTheme.colors.connectButtonInnerBackground = '#1e293b';
customDarkTheme.colors.modalBackground = '#111827';
customDarkTheme.colors.modalBorder = '#1e3a5f';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={customDarkTheme}
          locale="zh-CN"
          showRecentTransactions={true}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
