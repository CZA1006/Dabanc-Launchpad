#!/bin/bash

# ============================================
# DABANC Launchpad - Anvil 本地开发部署脚本
# ============================================

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       🚀 DABANC Launchpad - Anvil 本地部署                 ║"
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
echo -e "${YELLOW}📁 Step 1/7: 清理系统文件...${NC}"
find . -name "._*" -type f -delete 2>/dev/null
npx hardhat clean 2>/dev/null
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

# ============================================
# Step 2: 检查依赖
# ============================================
echo -e "${YELLOW}📦 Step 2/7: 检查依赖...${NC}"
if [ ! -d "node_modules" ]; then
    echo "   安装根目录依赖中..."
    npm install
fi
echo -e "${GREEN}✅ 依赖检查完成${NC}"
echo ""

# ============================================
# Step 3: 编译合约
# ============================================
echo -e "${YELLOW}🔨 Step 3/7: 编译智能合约...${NC}"
npx hardhat compile
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 编译失败${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 编译完成${NC}"
echo ""

# ============================================
# Step 4: 启动 Anvil
# ============================================
echo -e "${YELLOW}🔗 Step 4/7: 启动 Anvil 节点...${NC}"
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Anvil 已在运行${NC}"
else
    echo "   启动 Anvil 中..."
    anvil > /tmp/anvil.log 2>&1 &
    ANVIL_PID=$!
    echo $ANVIL_PID > /tmp/anvil.pid
    sleep 3
    
    if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Anvil 启动成功 (PID: $ANVIL_PID)${NC}"
    else
        echo -e "${RED}❌ Anvil 启动失败，请检查是否已安装 Foundry${NC}"
        echo "   安装命令: curl -L https://foundry.paradigm.xyz | bash && foundryup"
        exit 1
    fi
fi
echo ""

# ============================================
# Step 5: 部署合约
# ============================================
echo -e "${YELLOW}🚀 Step 5/7: 部署合约到 Anvil...${NC}"
npx hardhat run scripts/deploy_sepolia.ts --network localhost > /tmp/deploy_output.txt 2>&1

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 部署失败${NC}"
    cat /tmp/deploy_output.txt
    exit 1
fi

# 提取合约地址
AUCTION_ADDR=$(grep "Auction 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')
USDC_ADDR=$(grep "USDC 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')
TOKEN_ADDR=$(grep "wSPX 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')
VAULT_ADDR=$(grep "Vault 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')

if [[ ! "$AUCTION_ADDR" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    echo -e "${RED}❌ 合约地址提取失败${NC}"
    cat /tmp/deploy_output.txt
    exit 1
fi

echo -e "${GREEN}✅ 合约部署成功${NC}"
echo "   📍 Auction: $AUCTION_ADDR"
echo "   📍 USDC:    $USDC_ADDR"
echo "   📍 wSPX:    $TOKEN_ADDR"
echo "   📍 Vault:   $VAULT_ADDR"
echo ""

# ============================================
# Step 6: 更新配置文件
# ============================================
echo -e "${YELLOW}📝 Step 6/7: 更新配置文件...${NC}"

# 更新 .env
cat > .env << EOF
# ============================================
# Anvil 本地开发环境配置
# ============================================

# 网络配置
HARDHAT_NETWORK=localhost
PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 合约地址 (自动生成)
AUCTION_ADDRESS=$AUCTION_ADDR
USDC_ADDRESS=$USDC_ADDR
TOKEN_ADDRESS=$TOKEN_ADDR
VAULT_ADDRESS=$VAULT_ADDR

# Bot 配置
ROUND_DURATION=300
TOKEN_SUPPLY_PER_ROUND=500
MIN_CLEARING_PRICE=0.01
MAX_CLEARING_PRICE=1000
EOF

echo -e "${GREEN}✅ .env 已更新${NC}"
echo ""

# ============================================
# Step 7: 初始化拍卖环境
# ============================================
echo -e "${YELLOW}🎬 Step 7/7: 初始化拍卖环境...${NC}"

# 初始化数据库
mkdir -p backend_db
npx ts-node scripts/setup_db.ts > /dev/null 2>&1
echo "   ✅ 数据库初始化完成"

# 初始化拍卖合约
npx hardhat run scripts/init_auction.ts --network localhost > /dev/null 2>&1
echo "   ✅ 拍卖合约初始化完成"

# 添加白名单
npx hardhat run scripts/whitelist_user.ts --network localhost > /dev/null 2>&1
echo "   ✅ 白名单添加完成"

echo -e "${GREEN}✅ 初始化完成${NC}"
echo ""

# ============================================
# 部署完成
# ============================================
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    🎉 部署完成！                            ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  网络: Anvil Local (Chain ID: 31337)                       ║"
echo "║  RPC:  http://127.0.0.1:8545                               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${YELLOW}📌 下一步操作:${NC}"
echo ""
echo "   1️⃣  启动前端:"
echo "       cd dabanc-frontend && npm run dev"
echo ""
echo "   2️⃣  启动 API 服务 (新终端):"
echo "       npx hardhat run scripts/server.ts --network localhost"
echo ""
echo "   3️⃣  启动清算机器人 (新终端):"
echo "       npx hardhat run scripts/auto_bot.ts --network localhost"
echo ""
echo "   4️⃣  启动流量模拟器 (可选, 新终端):"
echo "       npx hardhat run scripts/simulate_traffic.ts --network localhost"
echo ""
echo -e "${YELLOW}💡 MetaMask 配置:${NC}"
echo "   网络名称:   Anvil Local"
echo "   RPC URL:    http://127.0.0.1:8545"
echo "   Chain ID:   31337"
echo "   测试私钥:   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""
echo -e "${RED}⚠️  停止 Anvil:${NC} ./stop-anvil.sh"
echo ""

