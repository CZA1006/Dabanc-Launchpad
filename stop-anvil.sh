#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🛑 正在停止 Anvil...${NC}"

# 停止通过脚本启动的 Anvil
if [ -f /tmp/anvil.pid ]; then
    PID=$(cat /tmp/anvil.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID
        rm -f /tmp/anvil.pid
        echo -e "${GREEN}✅ Anvil (PID: $PID) 已停止${NC}"
    else
        echo "⚠️  进程 $PID 不存在"
        rm -f /tmp/anvil.pid
    fi
fi

# 停止所有占用 8545 端口的进程
PORT_PIDS=$(lsof -ti:8545)
if [ ! -z "$PORT_PIDS" ]; then
    echo -e "${YELLOW}🔍 发现占用 8545 端口的进程...${NC}"
    for PID in $PORT_PIDS; do
        kill $PID 2>/dev/null
        echo -e "${GREEN}✅ 已停止进程 $PID${NC}"
    done
fi

# 清理临时文件
rm -f /tmp/anvil.log
rm -f /tmp/deploy_output.txt

echo -e "${GREEN}✅ 清理完成${NC}"

