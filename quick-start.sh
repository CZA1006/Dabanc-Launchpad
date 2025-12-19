#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "════════════════════════════════════════════════════════════"
echo "   🚀 Dabanc Launchpad 一键启动脚本"
echo "   动态供应量 + RWA 总量限制版本"
echo "════════════════════════════════════════════════════════════"
echo -e "${NC}"

# 清理 macOS 资源分支文件
echo -e "${YELLOW}📁 Step 1/9: 清理系统文件...${NC}"
find . -name "._*" -type f -delete 2>/dev/null
npx hardhat clean
echo -e "${GREEN}✅ 清理完成${NC}\n"

# 编译合约
echo -e "${YELLOW}🔨 Step 2/9: 编译智能合约...${NC}"
npx hardhat compile
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 编译失败${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 编译完成${NC}\n"

# 检查 Anvil 是否已运行
echo -e "${YELLOW}🔍 Step 3/9: 检查 Anvil 状态...${NC}"
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✅ Anvil 已在运行${NC}\n"
else
    echo -e "${YELLOW}⚠️  Anvil 未运行，正在启动...${NC}"
    anvil > /tmp/anvil.log 2>&1 &
    ANVIL_PID=$!
    echo $ANVIL_PID > /tmp/anvil.pid
    sleep 3
    echo -e "${GREEN}✅ Anvil 已启动 (PID: $ANVIL_PID)${NC}\n"
fi

# 部署合约
echo -e "${YELLOW}🚀 Step 4/9: 部署合约...${NC}"
npx hardhat run scripts/deploy_sepolia.ts --network localhost > /tmp/deploy_output.txt
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 部署失败${NC}"
    cat /tmp/deploy_output.txt
    exit 1
fi

# 提取合约地址 (使用正则匹配 0x 开头的地址)
AUCTION_ADDR=$(grep "Auction 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')
USDC_ADDR=$(grep "USDC 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')
WSPX_ADDR=$(grep "wSPX 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')
VAULT_ADDR=$(grep "Vault 合约:" /tmp/deploy_output.txt | grep -oE '0x[a-fA-F0-9]{40}')

echo -e "${GREEN}✅ 合约部署完成${NC}"
echo "   Auction: $AUCTION_ADDR"
echo "   USDC: $USDC_ADDR"
echo "   wSPX: $WSPX_ADDR"
echo "   Vault: $VAULT_ADDR"
echo ""

# 验证地址提取成功
if [[ ! "$AUCTION_ADDR" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    echo -e "${RED}❌ 合约地址提取失败！${NC}"
    echo "请检查部署输出："
    cat /tmp/deploy_output.txt
    exit 1
fi

# 更新 .env 文件
echo -e "${YELLOW}📝 Step 5/9: 更新配置文件...${NC}"
cat > .env << EOF
# Anvil 本地测试网络配置
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SEPOLIA_RPC_URL=http://127.0.0.1:8545

# 合约地址 (自动生成)
USDC_ADDRESS=$USDC_ADDR
AUCTION_TOKEN_ADDRESS=$WSPX_ADDR
AUCTION_ADDRESS=$AUCTION_ADDR
GREEN_SHOE_VAULT_ADDRESS=$VAULT_ADDR

# Bot 配置
BOT_POLLING_INTERVAL=2000
MIN_CLEARING_PRICE=0.01
MAX_CLEARING_PRICE=1000
ROUND_DURATION=300
TOKEN_SUPPLY_PER_ROUND=500

# 数据库配置
DB_PATH=./backend_db/orders.db
HISTORY_PATH=./backend_db/history.json
EOF
echo -e "${GREEN}✅ .env 文件已更新${NC}\n"

# 更新前端配置
echo -e "${YELLOW}📝 Step 6/9: 更新前端配置...${NC}"
sed -i.bak "s/export const AUCTION_ADDRESS = \".*\" as const;/export const AUCTION_ADDRESS = \"$AUCTION_ADDR\" as const;/" dabanc-frontend/src/constants.ts
sed -i.bak "s/export const USDC_ADDRESS = \".*\" as const;/export const USDC_ADDRESS = \"$USDC_ADDR\" as const;/" dabanc-frontend/src/constants.ts
rm -f dabanc-frontend/src/constants.ts.bak
echo -e "${GREEN}✅ 前端配置已更新${NC}\n"

# 初始化数据库
echo -e "${YELLOW}💾 Step 7/9: 初始化数据库...${NC}"
npx ts-node scripts/setup_db.ts > /dev/null 2>&1
echo -e "${GREEN}✅ 数据库初始化完成${NC}\n"

# 初始化拍卖环境
echo -e "${YELLOW}🎬 Step 8/9: 初始化拍卖环境...${NC}"
npx hardhat run scripts/init_auction.ts --network localhost > /dev/null
npx hardhat run scripts/whitelist_user.ts --network localhost > /dev/null
echo -e "${GREEN}✅ 拍卖环境初始化完成${NC}\n"

# 显示完成信息
echo -e "${YELLOW}🎉 Step 9/9: 部署完成！${NC}\n"

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ 所有服务已就绪！${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📋 下一步操作：${NC}\n"

echo -e "${GREEN}🌐 启动前端:${NC}"
echo "   cd dabanc-frontend && npm run dev"
echo "   访问: http://localhost:5173"
echo ""

echo -e "${GREEN}🤖 启动清算机器人（可选）:${NC}"
echo "   npx hardhat run scripts/auto_bot.ts --network localhost"
echo ""

echo -e "${GREEN}📊 启动流量模拟器（可选）:${NC}"
echo "   npx hardhat run scripts/simulate_traffic.ts --network localhost"
echo ""

echo -e "${GREEN}🧪 运行动态供应量测试:${NC}"
echo "   npx hardhat run scripts/test_dynamic_supply.ts --network hardhat"
echo ""

echo -e "${YELLOW}💡 MetaMask 配置:${NC}"
echo "   网络名称: Anvil Local"
echo "   RPC URL: http://127.0.0.1:8545"
echo "   Chain ID: 31337"
echo "   测试账户私钥: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${RED}⚠️  按 Ctrl+C 不会停止 Anvil，如需停止请运行:${NC}"
echo "   ./stop-anvil.sh"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

