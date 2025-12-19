# Dabanc Launchpad Protocol

> 🚀 去中心化批量拍卖平台 - 支持 KYC 白名单、绿鞋机制、动态供应量的 RWA 发行协议

## 📋 目录

- [项目概述](#项目概述)
- [核心特性](#核心特性)
- [架构设计](#架构设计)
- [快速开始](#快速开始)
  - [本地开发 (Anvil)](#本地开发-anvil)
  - [Sepolia 测试网](#sepolia-测试网部署)
- [合约说明](#合约说明)
- [脚本说明](#脚本说明)
- [前端功能](#前端功能)
- [配置指南](#配置指南)
- [常见问题](#常见问题)

---

## 项目概述

Dabanc Launchpad 是一个基于以太坊的批量拍卖协议，专为 RWA (Real World Assets) 代币发行设计。

### 核心特性

| 特性 | 描述 |
|------|------|
| 📊 **批量拍卖机制** | 统一清算价格 (Uniform Clearing Price)，确保公平定价 |
| 🔒 **KYC 白名单** | 链上合规准入控制 |
| 🛡️ **绿鞋机制** | 15% 护盘资金自动锁定至金库 |
| 📈 **动态供应量** | 根据市场需求自动调整每轮发行量 |
| ⛓️ **链下撮合 + 链上结算** | 高效且透明 |
| 💰 **一键提款** | Owner 可随时提取募集资金 |

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户层 (Frontend)                         │
│              React + Wagmi + Viem + RainbowKit                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   竞价面板    │  │  实时订单簿   │  │  结算结果    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        后端服务层 (Backend)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  auto_bot.ts │  │  SQLite DB   │  │   Config     │          │
│  │  (清算机器人) │  │  (订单簿)    │  │   (配置中心)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ simulate_    │  │   admin_     │                            │
│  │ traffic.ts   │  │ dashboard.ts │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       智能合约层 (Contracts)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ BatchAuction │◄─│ GreenShoeVault│  │  MockERC20   │          │
│  │  (拍卖合约)   │  │   (绿鞋金库)  │  │  (测试代币)   │          │
│  │  动态供应量   │  └──────────────┘  └──────────────┘          │
│  │  自动提款     │                                              │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│             以太坊网络 (Anvil / Sepolia / Mainnet)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 本地开发 (Anvil)

最简单的方式是使用一键部署脚本：

```bash
# 1. 安装依赖
npm install

# 2. 一键部署（启动 Anvil + 编译 + 部署 + 初始化）
./quick-start.sh

# 3. 启动前端（新终端）
cd dabanc-frontend && npm install && npm run dev

# 4. 启动清算机器人（新终端）
npx hardhat run scripts/auto_bot.ts --network localhost

# 5. (可选) 启动模拟流量（新终端）
npx hardhat run scripts/simulate_traffic.ts --network localhost
```

### 手动本地部署

```bash
# 1. 启动 Anvil
anvil

# 2. 编译合约
npm run compile

# 3. 部署合约
npx hardhat run scripts/deploy_sepolia.ts --network localhost

# 4. 配置 .env (填入部署输出的地址)
AUCTION_ADDRESS=0x...
USDC_ADDRESS=0x...
TOKEN_ADDRESS=0x...
VAULT_ADDRESS=0x...

# 5. 初始化
npx hardhat run scripts/init_auction.ts --network localhost
npx hardhat run scripts/whitelist_user.ts --network localhost
npx ts-node scripts/setup_db.ts
```

---

## Sepolia 测试网部署

### 准备工作

1. **获取测试 ETH**（至少 0.1 ETH）:
   - [Alchemy Faucet](https://sepoliafaucet.com)
   - [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)

2. **获取 RPC URL**:
   - 注册 [Alchemy](https://www.alchemy.com/)
   - 创建 Sepolia 项目，复制 HTTPS URL（确保是 `eth-sepolia` 不是 `eth-mainnet`）

3. **配置环境变量**:
```bash
# .env
PRIVATE_KEY=你的钱包私钥（不带0x前缀）
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/你的API_KEY
```

### 一键部署

```bash
./deploy-sepolia.sh
```

### 手动部署

```bash
# 1. 编译
npm run compile

# 2. 部署
npx hardhat run scripts/deploy_sepolia.ts --network sepolia

# 3. 更新 .env 中的合约地址（注意带 0x 前缀）
AUCTION_ADDRESS=0x...
USDC_ADDRESS=0x...
TOKEN_ADDRESS=0x...
VAULT_ADDRESS=0x...

# 4. 初始化
npx hardhat run scripts/init_auction.ts --network sepolia
npx hardhat run scripts/whitelist_user.ts --network sepolia
npx ts-node scripts/setup_db.ts

# 5. 启动 Bot
npx hardhat run scripts/auto_bot.ts --network sepolia
```

### 前端配置

更新 `dabanc-frontend/src/constants.ts`:
```typescript
export const AUCTION_ADDRESS = "0x部署后的地址" as const;
export const USDC_ADDRESS = "0x部署后的地址" as const;
```

---

## 合约说明

### BatchAuction.sol

批量拍卖核心合约，支持动态供应量和资金提取。

#### 主要函数

| 函数 | 权限 | 描述 |
|------|------|------|
| `placeBid(amount, limitPrice)` | 白名单用户 | 提交出价 |
| `executeClearing(price, users, tokens, refunds)` | Owner | 执行清算 (带分配) |
| `executeClearingSimple(price)` | Owner | 简化版清算 |
| `startNextRound()` | Owner | 开启下一轮 (自动调整供应量) |
| `claimTokens(roundId)` | 用户 | 领取代币 |
| `claimRefund(roundId)` | 用户 | 领取退款 |
| `withdrawProceeds()` | Owner | 🆕 提取募集资金 |
| `getAvailableProceeds()` | 任何人 | 🆕 查询可提取金额 |
| `getSupplyStats()` | 任何人 | 🆕 查询供应量统计 |
| `getDynamicSupplyConfig()` | 任何人 | 🆕 查询动态供应配置 |

#### 动态供应量机制

```
清算后自动调整下一轮供应量:

┌─────────────────────────────────────────────────┐
│  清算价格 > 目标价格 + 容差 → 供应量 ↑ 增加     │
│  清算价格 < 目标价格 - 容差 → 供应量 ↓ 减少     │
│  清算价格在容差范围内      → 供应量不变        │
└─────────────────────────────────────────────────┘
```

#### 安全特性

- ✅ `ReentrancyGuard` - 防重入攻击
- ✅ `Pausable` - 紧急暂停
- ✅ `SafeERC20` - 安全代币转账
- ✅ 价格范围限制
- ✅ 总供应量上限

### GreenShoeVault.sol

绿鞋机制金库，用于接收护盘资金 (15%)。

---

## 脚本说明

### 核心脚本

| 脚本 | 功能 | 运行方式 |
|------|------|----------|
| `auto_bot.ts` | 清算机器人 | `npx hardhat run scripts/auto_bot.ts --network <network>` |
| `simulate_traffic.ts` | 模拟订单流量 | `npx hardhat run scripts/simulate_traffic.ts --network <network>` |
| `admin_dashboard.ts` | 管理员仪表板 | `npx hardhat run scripts/admin_dashboard.ts --network <network>` |
| `withdraw_proceeds.ts` | 提取募集资金 | `npx hardhat run scripts/withdraw_proceeds.ts --network <network>` |

### 初始化脚本

| 脚本 | 功能 |
|------|------|
| `deploy_sepolia.ts` | 部署所有合约 |
| `init_auction.ts` | 初始化拍卖（铸造代币、授权、开启轮次） |
| `whitelist_user.ts` | 添加用户到 KYC 白名单 |
| `setup_db.ts` | 初始化 SQLite 数据库 |

### 调试脚本

| 脚本 | 功能 |
|------|------|
| `diagnose.ts` | 诊断合约状态 |
| `debug_clearing.ts` | 调试清算问题 |
| `check_bids.ts` | 检查链上出价 |
| `show_account.ts` | 显示当前账户地址 |

---

## 前端功能

### 用户界面

1. **竞价面板**: 输入金额和限价提交出价
2. **实时订单簿**: 显示当前轮次所有出价
3. **倒计时**: 显示轮次剩余时间
4. **资产面板**: 显示 USDC 和 wSPX 余额

### 🆕 结算结果显示

每轮清算后，参与用户会看到：

```
┌─────────────────────────────────────┐
│  🎉 Round #5 结算结果               │
├─────────────────────────────────────┤
│  清算价格          $12.50           │
│  您的总出价        1,500.00 USDC    │
│  🪙 获得代币       100.00 wSPX     │
│  💵 实际花费       1,250.00 USDC    │
│  💰 可退款金额     250.00 USDC      │
├─────────────────────────────────────┤
│  [🎁 领取 wSPX 代币]                │
│  [💸 领取退款]                      │
└─────────────────────────────────────┘
```

---

## 配置指南

### 环境变量 (.env)

```bash
# === 必填 ===
PRIVATE_KEY=你的私钥
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/xxx

# === 合约地址 (部署后填入) ===
AUCTION_ADDRESS=0x...
USDC_ADDRESS=0x...
TOKEN_ADDRESS=0x...
VAULT_ADDRESS=0x...

# === Bot 配置 (可选) ===
BOT_POLLING_INTERVAL=2000          # 轮询间隔 (毫秒)
BOT_POST_CLEARING_DELAY=5000       # 清算后等待时间 (毫秒)
BOT_AUTO_WITHDRAW=false            # 🆕 清算后自动提款

# === 价格范围 (可选) ===
MIN_CLEARING_PRICE=0.01
MAX_CLEARING_PRICE=1000
```

### config/addresses.ts

统一的地址配置中心：

```typescript
import { getAddress, BOT_CONFIG } from "./config/addresses";

// 获取地址 (自动验证)
const auctionAddr = getAddress("auction");

// 使用配置
const interval = BOT_CONFIG.pollingInterval;
const autoWithdraw = BOT_CONFIG.autoWithdraw;
```

---

## Owner 操作指南

### 提取募集资金

**方式一：手动提取**
```bash
npx hardhat run scripts/withdraw_proceeds.ts --network sepolia
```

**方式二：清算后自动提取**

在 `.env` 中设置：
```bash
BOT_AUTO_WITHDRAW=true
```

**方式三：查看管理仪表板**
```bash
npx hardhat run scripts/admin_dashboard.ts --network sepolia
```

输出示例：
```
💰 资金统计
─────────────────────────────
  合约 USDC 余额: 15,000.00 USDC
  可提取金额:    15,000.00 USDC
  
📊 供应量统计
─────────────────────────────
  总供应量:      10,000,000 wSPX
  已发行:        2,500 wSPX
  剩余:          9,997,500 wSPX
```

---

## 清算机制说明

### 批量拍卖原理

```
1. 所有出价按限价从高到低排序
2. 累计需求直到等于供应量
3. 边际成交价即为统一清算价
4. 所有成功的出价都以清算价成交

示例:
┌───────┬─────────┬─────────┬─────────────────┐
│ 排名  │ 限价    │ 数量    │ 累计需求        │
├───────┼─────────┼─────────┼─────────────────┤
│ #1    │ $20.00  │ 100     │ 100 / 500 ✅   │
│ #2    │ $15.00  │ 200     │ 300 / 500 ✅   │
│ #3    │ $12.00  │ 150     │ 450 / 500 ✅   │
│ #4    │ $10.00  │ 100     │ 500 / 500 🎯   │ ← 边际成交
│ #5    │ $8.00   │ 50      │ 500 / 500 ❌   │ ← 出局
└───────┴─────────┴─────────┴─────────────────┘

清算价: $10.00 (所有人都以此价格成交)
```

### 高价不会垄断

即使出价最高，也不会独占所有代币：
- 每个出价以 `金额 / 清算价` 计算可获得的代币数量
- 高价只保证成交，不保证获得更多代币

---

## 常见问题

### Q: Bot 显示 "resolveName" 错误？

**原因**: `.env` 中的合约地址格式错误（缺少 `0x` 前缀）

**解决**: 确保所有地址都以 `0x` 开头：
```bash
AUCTION_ADDRESS=0x9b01CdD020D0DD7c6385b46ab3D809562c94Ac09  # ✅
AUCTION_ADDRESS=9b01CdD020D0DD7c6385b46ab3D809562c94Ac09    # ❌
```

### Q: Bot 清算失败，提示 "TimeNotUp"？

**原因**: Bot 使用本地时间，但合约使用区块链时间，Sepolia 区块时间可能滞后

**解决**: 最新版 Bot 已修复，会使用链上时间并添加 15 秒安全缓冲

### Q: 前端只显示我自己的订单？

**原因**: RPC 节点对事件查询范围有限制（Alchemy 免费版限制 10 个区块）

**解决**: 
1. 使用付费 RPC 节点
2. 或在 `wagmi.ts` 中配置公共 RPC 节点

### Q: 模拟器只显示一个地址？

**原因**: Sepolia 上只有一个私钥，只能用一个地址

**解决**: 本地 Anvil 环境会使用多个测试地址

---

## 安全建议

### 生产环境检查清单

- [ ] 移除或禁用 `MockERC20` 的测试功能
- [ ] 使用多签钱包作为 Owner
- [ ] 配置合理的价格范围
- [ ] 设置 DEX 白名单
- [ ] 审计所有合约代码
- [ ] 测试紧急暂停功能
- [ ] 备份数据库
- [ ] 监控 Bot 运行状态

---

## 许可证

MIT License

---

*最后更新: 2024-12*
