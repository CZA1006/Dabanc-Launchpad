#!/bin/bash

# ============================================
# DABANC Launchpad - Sepolia 测试网部署脚本
# ============================================

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       🚀 DABANC Launchpad - Sepolia Testnet 部署           ║"
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
echo -e "${YELLOW}📁 Step 1/6: 清理系统文件...${NC}"
find . -name "._*" -type f -delete 2>/dev/null
npx hardhat clean 2>/dev/null
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

# ============================================
# Step 2: 检查环境配置
# ============================================
echo -e "${YELLOW}🔐 Step 2/6: 检查环境配置...${NC}"

if [ ! -f .env ]; then
    echo -e "${RED}❌ 错误: 未找到 .env 文件${NC}"
    echo ""
    echo "请先创建 .env 文件并配置以下内容:"
    echo "  PRIVATE_KEY=your_private_key_here"
    echo "  SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_api_key"
    echo ""
    exit 1
fi

source .env 2>/dev/null

if [ -z "$PRIVATE_KEY" ] || [ "$PRIVATE_KEY" = "your_private_key_here" ]; then
    echo -e "${RED}❌ 错误: PRIVATE_KEY 未正确配置${NC}"
    exit 1
fi

if [ -z "$SEPOLIA_RPC_URL" ] || [[ "$SEPOLIA_RPC_URL" == *"your_api_key"* ]]; then
    echo -e "${RED}❌ 错误: SEPOLIA_RPC_URL 未正确配置${NC}"
    echo ""
    echo "请在 .env 中设置 Alchemy/Infura 的 Sepolia RPC URL"
    exit 1
fi

echo -e "${GREEN}✅ 环境配置检查通过${NC}"
echo ""

# ============================================
# Step 3: 编译合约
# ============================================
echo -e "${YELLOW}🔨 Step 3/6: 编译智能合约...${NC}"
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
echo -e "${YELLOW}🚀 Step 4/6: 部署到 Sepolia 测试网...${NC}"
echo "   ⏳ 这可能需要 1-2 分钟，请耐心等待..."
echo ""

DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy_sepolia.ts --network sepolia 2>&1)
echo "$DEPLOY_OUTPUT"

# 提取合约地址
USDC_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "USDC 合约:" | grep -oE '0x[a-fA-F0-9]{40}')
TOKEN_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "wSPX 合约:" | grep -oE '0x[a-fA-F0-9]{40}')
AUCTION_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "Auction 合约:" | grep -oE '0x[a-fA-F0-9]{40}')
VAULT_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "Vault 合约:" | grep -oE '0x[a-fA-F0-9]{40}')

if [ -z "$AUCTION_ADDR" ]; then
    echo -e "${RED}❌ 部署失败，未能提取合约地址${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ 合约部署成功${NC}"
echo ""

# ============================================
# Step 5: 更新配置文件
# ============================================
echo -e "${YELLOW}📝 Step 5/6: 更新配置文件...${NC}"

# 更新 .env 中的合约地址
sed -i.bak "s|^AUCTION_ADDRESS=.*|AUCTION_ADDRESS=$AUCTION_ADDR|" .env 2>/dev/null || echo "AUCTION_ADDRESS=$AUCTION_ADDR" >> .env
sed -i.bak "s|^USDC_ADDRESS=.*|USDC_ADDRESS=$USDC_ADDR|" .env 2>/dev/null || echo "USDC_ADDRESS=$USDC_ADDR" >> .env
sed -i.bak "s|^TOKEN_ADDRESS=.*|TOKEN_ADDRESS=$TOKEN_ADDR|" .env 2>/dev/null || echo "TOKEN_ADDRESS=$TOKEN_ADDR" >> .env
sed -i.bak "s|^VAULT_ADDRESS=.*|VAULT_ADDRESS=$VAULT_ADDR|" .env 2>/dev/null || echo "VAULT_ADDRESS=$VAULT_ADDR" >> .env
sed -i.bak "s|^HARDHAT_NETWORK=.*|HARDHAT_NETWORK=sepolia|" .env 2>/dev/null || echo "HARDHAT_NETWORK=sepolia" >> .env
rm -f .env.bak

echo -e "${GREEN}✅ .env 已更新${NC}"
echo ""

# ============================================
# Step 6: 初始化拍卖环境
# ============================================
echo -e "${YELLOW}🎬 Step 6/6: 初始化拍卖环境...${NC}"

# 初始化数据库
mkdir -p backend_db
npx ts-node scripts/setup_db.ts > /dev/null 2>&1
echo "   ✅ 数据库初始化完成"

# 初始化拍卖合约
npx hardhat run scripts/init_auction.ts --network sepolia > /dev/null 2>&1
echo "   ✅ 拍卖合约初始化完成"

# 添加白名单
npx hardhat run scripts/whitelist_user.ts --network sepolia > /dev/null 2>&1
echo "   ✅ 白名单添加完成"

echo -e "${GREEN}✅ 初始化完成${NC}"
echo ""

# ============================================
# 部署完成
# ============================================
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    🎉 部署完成！                            ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  网络: Sepolia Testnet (Chain ID: 11155111)                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}📍 Etherscan 链接:${NC}"
echo "   Auction: https://sepolia.etherscan.io/address/$AUCTION_ADDR"
echo "   USDC:    https://sepolia.etherscan.io/address/$USDC_ADDR"
echo "   wSPX:    https://sepolia.etherscan.io/address/$TOKEN_ADDR"
echo "   Vault:   https://sepolia.etherscan.io/address/$VAULT_ADDR"
echo ""
echo -e "${YELLOW}📌 下一步操作:${NC}"
echo ""
echo "   1️⃣  确认前端网络配置:"
echo "       检查 dabanc-frontend/src/wagmi.ts 中 ACTIVE_NETWORK = 'sepolia'"
echo ""
echo "   2️⃣  启动前端:"
echo "       cd dabanc-frontend && npm run dev"
echo ""
echo "   3️⃣  启动 API 服务 (新终端):"
echo "       npx hardhat run scripts/server.ts --network sepolia"
echo ""
echo "   4️⃣  启动清算机器人 (新终端):"
echo "       npx hardhat run scripts/auto_bot.ts --network sepolia"
echo ""
echo "   5️⃣  启动流量模拟器 (可选, 新终端):"
echo "       npx hardhat run scripts/simulate_traffic.ts --network sepolia"
echo ""
