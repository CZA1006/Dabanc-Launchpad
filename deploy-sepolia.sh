#!/bin/bash
# ============================================
# Sepolia 测试网一键部署脚本
# ============================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       🚀 DABANC Launchpad - Sepolia 部署脚本                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "❌ 错误: 未找到 .env 文件"
    echo ""
    echo "请先配置 .env 文件:"
    echo "  1. 复制模板: cp .env.sepolia.example .env"
    echo "  2. 编辑 .env 填入你的 PRIVATE_KEY 和 SEPOLIA_RPC_URL"
    exit 1
fi

# 检查必要的环境变量
source .env 2>/dev/null || true

if [ -z "$PRIVATE_KEY" ] || [ "$PRIVATE_KEY" = "0x你的私钥（64位十六进制，不含0x前缀也可以）" ]; then
    echo "❌ 错误: 请在 .env 中设置有效的 PRIVATE_KEY"
    exit 1
fi

if [ -z "$SEPOLIA_RPC_URL" ] || [[ "$SEPOLIA_RPC_URL" == *"你的API密钥"* ]]; then
    echo "❌ 错误: 请在 .env 中设置有效的 SEPOLIA_RPC_URL"
    exit 1
fi

echo "✅ 环境变量检查通过"
echo ""

# 解决 macOS 遗留问题：清理 ._* 文件
echo "🧹 Step 0: 清理 macOS 遗留文件..."
find . -name '._*' -type f -delete 2>/dev/null || true

# 检查依赖，解决 Hardhat HHE22 错误
if [ ! -d "node_modules" ]; then
    echo "📦 发现缺少依赖，正在自动安装..."
    npm install
fi

# 编译合约
echo "📦 Step 1: 编译智能合约..."
npm run compile
echo ""

# 部署合约
echo "🚀 Step 2: 部署到 Sepolia 测试网..."
echo "⏳ 这可能需要 1-2 分钟，请耐心等待..."
echo ""

DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy_sepolia.ts --network sepolia 2>&1)
echo "$DEPLOY_OUTPUT"

# 提取合约地址
USDC_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "USDC 合约:" | grep -oE '0x[a-fA-F0-9]{40}')
TOKEN_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "wSPX 合约:" | grep -oE '0x[a-fA-F0-9]{40}')
AUCTION_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "Auction 合约:" | grep -oE '0x[a-fA-F0-9]{40}')
VAULT_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "Vault 合约:" | grep -oE '0x[a-fA-F0-9]{40}')

if [ -z "$AUCTION_ADDR" ]; then
    echo "❌ 部署失败，未能提取合约地址"
    exit 1
fi

echo ""
echo "✅ 合约部署成功！"
echo ""

# 更新 .env 文件
echo "📝 Step 3: 更新 .env 文件..."

# 使用 sed 更新或追加地址
if grep -q "^AUCTION_ADDRESS=" .env; then
    sed -i.bak "s|^AUCTION_ADDRESS=.*|AUCTION_ADDRESS=$AUCTION_ADDR|" .env
else
    echo "AUCTION_ADDRESS=$AUCTION_ADDR" >> .env
fi

if grep -q "^USDC_ADDRESS=" .env; then
    sed -i.bak "s|^USDC_ADDRESS=.*|USDC_ADDRESS=$USDC_ADDR|" .env
else
    echo "USDC_ADDRESS=$USDC_ADDR" >> .env
fi

if grep -q "^TOKEN_ADDRESS=" .env; then
    sed -i.bak "s|^TOKEN_ADDRESS=.*|TOKEN_ADDRESS=$TOKEN_ADDR|" .env
else
    echo "TOKEN_ADDRESS=$TOKEN_ADDR" >> .env
fi

if grep -q "^VAULT_ADDRESS=" .env; then
    sed -i.bak "s|^VAULT_ADDRESS=.*|VAULT_ADDRESS=$VAULT_ADDR|" .env
else
    echo "VAULT_ADDRESS=$VAULT_ADDR" >> .env
fi

rm -f .env.bak
echo "✅ .env 文件已更新"
echo ""

# 更新前端常量文件
echo "💻 Step 3.5: 更新前端 constants.ts..."
FRONTEND_CONSTANTS="dabanc-frontend/src/constants.ts"
if [ -f "$FRONTEND_CONSTANTS" ]; then
    sed -i.bak "s|export const AUCTION_ADDRESS = \".*\"|export const AUCTION_ADDRESS = \"$AUCTION_ADDR\"|" "$FRONTEND_CONSTANTS"
    sed -i.bak "s|export const USDC_ADDRESS = \".*\"|export const USDC_ADDRESS = \"$USDC_ADDR\"|" "$FRONTEND_CONSTANTS"
    sed -i.bak "s|export const TOKEN_ADDRESS = \".*\"|export const TOKEN_ADDRESS = \"$TOKEN_ADDR\"|" "$FRONTEND_CONSTANTS"
    rm -f "${FRONTEND_CONSTANTS}.bak"
    echo "✅ 前端 constants.ts 已更新"
else
    echo "⚠️ 警告: 未找到前端配置文件 $FRONTEND_CONSTANTS，跳过更新"
fi
echo ""

# 初始化数据库
echo "💾 Step 4: 初始化数据库..."
npx hardhat run scripts/setup_db.ts --network sepolia
echo ""

# 初始化拍卖
echo "🎬 Step 5: 初始化拍卖环境..."
npx hardhat run scripts/init_auction.ts --network sepolia
echo ""

# 添加白名单
echo "📋 Step 6: 添加白名单..."
npx hardhat run scripts/whitelist_user.ts --network sepolia
echo ""

# 输出前端配置
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🎉 部署完成！                              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  请将以下地址更新到前端 constants.ts:                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo "📌 Etherscan 链接:"
echo "   USDC:    https://sepolia.etherscan.io/address/$USDC_ADDR"
echo "   wSPX:    https://sepolia.etherscan.io/address/$TOKEN_ADDR"
echo "   Auction: https://sepolia.etherscan.io/address/$AUCTION_ADDR"
echo "   Vault:   https://sepolia.etherscan.io/address/$VAULT_ADDR"
echo ""
echo "🔥 下一步:"
echo "   1. 更新前端 dabanc-frontend/src/constants.ts 中的合约地址"
echo "   2. 确保前端 wagmi.ts 中 chains 包含 sepolia"
echo "   3. 运行前端: cd dabanc-frontend && npm run dev"
echo "   4. 运行清算机器人: npx hardhat run scripts/auto_bot.ts --network sepolia"
echo ""

