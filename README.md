# Dabanc Launchpad Protocol

> 🚀 去中心化批量拍卖平台 - 支持 KYC 白名单、绿鞋机制的 RWA 发行协议

## 📋 目录

- [项目概述](#项目概述)
- [安全更新日志](#-安全更新日志-v20)
- [架构设计](#架构设计)
- [快速开始](#快速开始)
- [合约说明](#合约说明)
- [脚本说明](#脚本说明)
- [配置指南](#配置指南)
- [API 参考](#api-参考)

---

## 项目概述

Dabanc Launchpad 是一个基于以太坊的批量拍卖协议，专为 RWA (Real World Assets) 代币发行设计。核心特性：

- **批量拍卖机制**: 统一清算价格，公平定价
- **KYC 白名单**: 合规准入控制
- **绿鞋机制**: 15% 护盘资金自动锁定
- **链下撮合 + 链上结算**: 高效且透明

---

## 🔐 安全更新日志 (v2.0)

### 📅 更新日期: 2024-12

本次更新针对安全审计发现的高危和中危问题进行了全面修复：

### ✅ 已修复的高优先级问题 (P0)

| 问题 | 风险等级 | 修复方案 | 影响文件 |
|------|----------|----------|----------|
| **缺少重入保护** | 🔴 高 | 引入 `ReentrancyGuard`，所有资金操作添加 `nonReentrant` | `BatchAuction.sol`, `GreenShoeVault.sol` |
| **用户无法提取资金** | 🔴 高 | 新增 `claimTokens()` 和 `claimRefund()` 函数 | `BatchAuction.sol` |
| **MockERC20 无限铸造** | 🔴 高 | 添加 `onlyOwner` 和 `isMinter` 权限控制，设置铸造上限 | `MockERC20.sol` |

### ✅ 已修复的中优先级问题 (P1)

| 问题 | 风险等级 | 修复方案 | 影响文件 |
|------|----------|----------|----------|
| **缺少紧急暂停机制** | 🟠 中 | 引入 `Pausable`，添加 `pause()`/`unpause()` 函数 | `BatchAuction.sol`, `GreenShoeVault.sol` |
| **Owner 权限过大** | 🟠 中 | 添加价格范围限制 `minClearingPrice`/`maxClearingPrice` | `BatchAuction.sol` |
| **GreenShoeVault 任意转账** | 🟠 中 | 添加 DEX 白名单机制 `approvedDexAddresses` | `GreenShoeVault.sol` |
| **approve 使用不当** | 🟠 中 | 使用 `forceApprove()` 安全重置授权 | `BatchAuction.sol` |
| **硬编码地址不一致** | 🟠 中 | 创建统一配置文件 `config/addresses.ts` | 所有脚本 |
| **链上/数据库不同步** | 🟠 中 | 添加事件追赶机制 `catchUpEvents()` | `auto_bot.ts` |
| **数据库缺少索引** | 🟠 中 | 添加 6+ 个查询优化索引 | `setup_db.ts` |
| **浮点精度问题** | 🟠 中 | 使用 `formatBigIntSafe()` 安全转换 | `auto_bot.ts` |

### 📁 新增/修改的文件清单

```
contracts/
├── BatchAuction.sol      ✏️ 重大更新 - 安全增强
├── GreenShoeVault.sol    ✏️ 重大更新 - 安全增强  
└── MockERC20.sol         ✏️ 更新 - 权限控制

config/
└── addresses.ts          🆕 新增 - 统一配置

scripts/
├── auto_bot.ts           ✏️ 重大更新 - 事件追赶、精度
└── setup_db.ts           ✏️ 更新 - 索引、新表
```

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户层 (Frontend)                         │
│                    React + Wagmi + Viem                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        后端服务层 (Backend)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  auto_bot.ts │  │  SQLite DB   │  │   Config     │          │
│  │  (清算机器人) │  │  (订单簿)    │  │   (配置中心)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       智能合约层 (Contracts)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ BatchAuction │◄─│ GreenShoeVault│  │  MockERC20   │          │
│  │  (拍卖合约)   │  │   (绿鞋金库)  │  │  (测试代币)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    以太坊网络 (Sepolia / Mainnet)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑 .env 文件，填入以下内容：
PRIVATE_KEY=your_private_key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_key
AUCTION_ADDRESS=0x...
USDC_ADDRESS=0x...
```

### 3. 编译合约

```bash
npx hardhat compile
```

### 4. 运行测试

```bash
npx hardhat test
```

### 5. 部署到 Sepolia

```bash
npx hardhat run scripts/deploy_sepolia.ts --network sepolia
```

### 6. 初始化数据库

```bash
npx ts-node scripts/setup_db.ts
```

### 7. 启动清算机器人

```bash
npx hardhat run scripts/auto_bot.ts --network sepolia
```

---

## 合约说明

### BatchAuction.sol

批量拍卖核心合约，负责：
- 用户出价管理
- 轮次控制
- 清算执行
- 代币分配与退款

#### 主要函数

| 函数 | 权限 | 描述 |
|------|------|------|
| `placeBid(amount, limitPrice)` | 白名单用户 | 提交出价 |
| `executeClearing(price, users, tokens, refunds)` | Owner | 执行清算 (带分配) |
| `executeClearingSimple(price)` | Owner | 简化版清算 |
| `startNextRound()` | Owner | 开启下一轮 |
| `claimTokens(roundId)` | 用户 | 领取代币 |
| `claimRefund(roundId)` | 用户 | 领取退款 |
| `pause()` / `unpause()` | Owner | 紧急暂停/恢复 |
| `setPriceRange(min, max)` | Owner | 设置价格范围 |

#### 安全特性

- ✅ `ReentrancyGuard` - 防重入攻击
- ✅ `Pausable` - 紧急暂停
- ✅ `SafeERC20` - 安全代币转账
- ✅ 价格范围限制
- ✅ 自定义错误 (节省 Gas)

### GreenShoeVault.sol

绿鞋机制金库，用于：
- 接收护盘资金 (15%)
- 执行二级市场回购

#### 主要函数

| 函数 | 权限 | 描述 |
|------|------|------|
| `depositStabilizationFunds(amount)` | 拍卖合约 | 存入资金 |
| `executeBuyback(amount, dexAddress)` | Owner | 执行回购 |
| `setApprovedDex(dex, approved)` | Owner | 设置 DEX 白名单 |

### MockERC20.sol

测试用 ERC20 代币（⚠️ 仅用于测试）

#### 安全限制

- 铸造上限: 1 亿代币
- 铸造权限: 仅 Owner 或授权 Minter

---

## 脚本说明

### auto_bot.ts (主要清算机器人)

功能：
1. 监听链上 `BidPlaced` 事件
2. 事件追赶 (防止重启丢失)
3. 订单簿撮合计算
4. 执行链上清算
5. 自动开启下一轮

### setup_db.ts (数据库初始化)

创建的表：
- `bids` - 出价记录
- `rounds` - 轮次信息
- `users` - 用户统计
- `metadata` - 元数据
- `event_logs` - 事件日志

索引：
- `idx_bids_roundId` - 按轮次查询
- `idx_bids_userAddress` - 按用户查询
- `idx_bids_limitPrice` - 按价格排序
- 等 6+ 个优化索引

---

## 配置指南

### config/addresses.ts

统一的地址配置中心：

```typescript
import { getAddress, BOT_CONFIG } from "./config/addresses";

// 获取地址 (自动验证)
const auctionAddr = getAddress("auction");

// 使用配置
const interval = BOT_CONFIG.pollingInterval;
```

### 环境变量

| 变量 | 必填 | 描述 |
|------|------|------|
| `PRIVATE_KEY` | ✅ | 部署者私钥 |
| `SEPOLIA_RPC_URL` | ✅ | RPC 节点 URL |
| `AUCTION_ADDRESS` | ✅ | 拍卖合约地址 |
| `USDC_ADDRESS` | ✅ | USDC 代币地址 |
| `BOT_POLLING_INTERVAL` | ❌ | 轮询间隔 (默认 2000ms) |
| `MIN_CLEARING_PRICE` | ❌ | 最低价格 (默认 0.01) |
| `MAX_CLEARING_PRICE` | ❌ | 最高价格 (默认 1000) |

---

## API 参考

### 查询用户出价详情

```typescript
const [totalAmount, tokensAllocated, refundAmount, hasClaimed, hasRefunded] = 
  await auction.getUserBidDetails(roundId, userAddress);
```

### 查询轮次剩余时间

```typescript
const remainingSeconds = await auction.getRemainingTime();
```

### 查询金库统计

```typescript
const [balance, totalReceived, totalUsedForBuyback] = 
  await vault.getStats();
```

---

## 安全建议

### 生产环境部署前检查清单

- [ ] 移除或禁用 `MockERC20` 的测试功能
- [ ] 使用多签钱包作为 Owner
- [ ] 配置合理的价格范围
- [ ] 设置 DEX 白名单
- [ ] 审计所有合约代码
- [ ] 测试紧急暂停功能
- [ ] 备份数据库定期执行
- [ ] 监控机器人运行状态

### 已知限制

1. 清算机器人是中心化的 (需要 Owner 私钥)
2. SQLite 不适合高并发场景 (建议生产环境使用 PostgreSQL)
3. 事件追赶在极端情况下可能有延迟

---

## 许可证

MIT License

---

## 联系方式

如有安全问题，请通过以下方式联系：
- Email: security@dabanc.io
- Discord: [Dabanc Community]

---

*最后更新: 2024-12*
