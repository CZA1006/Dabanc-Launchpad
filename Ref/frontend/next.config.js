/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // 处理 Node.js 模块的兼容性问题
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        'pino-pretty': false,
      };

      // 解决 @react-native-async-storage/async-storage 问题
      config.resolve.alias = {
        ...config.resolve.alias,
        '@react-native-async-storage/async-storage': false,
      };
    }

    // 忽略有问题的模块
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    return config;
  },
  // 忽略 TypeScript 和 ESLint 错误（开发阶段）
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
