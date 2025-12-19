#!/bin/bash

# 颜色定义
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   🌐 启动 Dabanc 前端界面${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"

cd dabanc-frontend

echo -e "${GREEN}📦 检查依赖...${NC}"
if [ ! -d "node_modules" ]; then
    echo "安装依赖中..."
    npm install
fi

echo -e "${GREEN}🚀 启动开发服务器...${NC}\n"
npm run dev

