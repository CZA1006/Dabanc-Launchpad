#!/bin/bash

# ============================================
# DABANC Launchpad - Hyperliquid 测试网部署脚本
# ============================================

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       🚀 DABANC Launchpad - Hyperliquid Testnet 部署       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ============================================
# Step 1: 清理系统文件
# ============================================
echo -e "${YELLOW}📁 Step 1/5: 清理系统文件...${NC}"
find . -name "._*" -type f -delete 2>/dev/null
npx hardhat clean 2>/dev/null
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

# ============================================
# Step 2: 检查环境配置
# ============================================
echo -e "${YELLOW}🔐 Step 2/5: 检查环境配置...${NC}"

if [ ! -f .env ]; then
    echo -e "${RED}❌ 错误: 未找到 .env 文件${NC}"
    echo ""
    echo "请先创建 .env 文件并配置以下内容:"
    echo "  PRIVATE_KEY=your_private_key_here"
    echo ""
    exit 1
fi

source .env 2>/dev/null

if [ -z "$PRIVATE_KEY" ] || [ "$PRIVATE_KEY" = "your_private_key_here" ]; then
    echo -e "${RED}❌ 错误: PRIVATE_KEY 未正确配置${NC}"
    echo ""
    echo "请在 .env 文件中设置你的私钥 (不带 0x 前缀)"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ 环境配置检查通过${NC}"
echo ""

# ============================================
# Step 3: 编译合约
# ============================================
echo -e "${YELLOW}🔨 Step 3/5: 编译智能合约...${NC}"
npx hardhat compile
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 编译失败${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 编译完成${NC}"
echo ""

# ============================================
# Step 4: 部署合约
# ============================================
echo -e "${YELLOW}🚀 Step 4/5: 部署到 Hyperliquid 测试网...${NC}"
echo "   ⏳ 这可能需要 1-2 分钟，请耐心等待..."
echo ""

npx hardhat run scripts/deploy_hyperliquid.ts --network hyperliquid_testnet

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}❌ 部署失败，请检查错误信息${NC}"
    exit 1
fi

echo ""

# ============================================
# Step 5: 部署完成
# ============================================
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    🎉 部署完成！                            ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  网络: Hyperliquid Testnet (Chain ID: 998)                 ║"
echo "║  RPC:  https://rpc.hyperliquid-testnet.xyz/evm             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${YELLOW}📌 下一步操作:${NC}"
echo ""
echo "   1️⃣  确认前端网络配置:"
echo "       检查 dabanc-frontend/src/wagmi.ts 中 ACTIVE_NETWORK = 'hyperliquid'"
echo ""
echo "   2️⃣  启动前端:"
echo "       cd dabanc-frontend && npm run dev"
echo ""
echo "   3️⃣  启动 API 服务 (新终端):"
echo "       npx hardhat run scripts/server.ts --network hyperliquid_testnet"
echo ""
echo "   4️⃣  启动清算机器人 (新终端):"
echo "       npx hardhat run scripts/auto_bot.ts --network hyperliquid_testnet"
echo ""
echo "   5️⃣  启动流量模拟器 (可选, 新终端):"
echo "       npx hardhat run scripts/simulate_traffic.ts --network hyperliquid_testnet"
echo ""
echo -e "${YELLOW}💡 MetaMask 配置:${NC}"
echo "   网络名称:   Hyperliquid Testnet"
echo "   RPC URL:    https://rpc.hyperliquid-testnet.xyz/evm"
echo "   Chain ID:   998"
echo "   货币符号:   HYPE"
echo "   浏览器:     https://explorer.hyperliquid-testnet.xyz"
echo ""
