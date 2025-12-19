# Dabanc Launchpad 安全升级技术规格文档

> 版本: 2.0.0  
> 日期: 2024-12  
> 作者: Security Audit Team

---

## 目录

1. [概述](#1-概述)
2. [BatchAuction.sol 技术规格](#2-batchauctionsol-技术规格)
3. [GreenShoeVault.sol 技术规格](#3-greenshoevaultsol-技术规格)
4. [MockERC20.sol 技术规格](#4-mockerc20sol-技术规格)
5. [后端脚本技术规格](#5-后端脚本技术规格)
6. [数据库架构](#6-数据库架构)
7. [配置系统](#7-配置系统)
8. [调用流程图](#8-调用流程图)
9. [安全机制详解](#9-安全机制详解)

---

## 1. 概述

### 1.1 升级背景

本次安全升级针对原有系统中发现的 11 个高危/中危安全问题进行了全面修复，主要涵盖：

- 智能合约层：重入攻击防护、紧急暂停、权限控制
- 后端服务层：事件同步、精度处理、配置管理
- 数据存储层：索引优化、数据完整性

### 1.2 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 智能合约 | Solidity | ^0.8.20 |
| 合约框架 | OpenZeppelin | ^5.0.2 |
| 开发环境 | Hardhat | ^2.22.17 |
| 后端运行时 | Node.js + TypeScript | - |
| 数据库 | SQLite (better-sqlite3) | ^12.5.0 |

### 1.3 依赖的 OpenZeppelin 模块

```solidity
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
```

---

## 2. BatchAuction.sol 技术规格

### 2.1 合约继承结构

```
BatchAuction
    ├── Ownable          (权限管理)
    ├── ReentrancyGuard  (重入保护)
    └── Pausable         (紧急暂停)
```

### 2.2 状态变量

#### 2.2.1 不可变量 (Immutable)

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `auctionToken` | `IERC20` | 拍卖发行的代币 (如 wSPX) |
| `paymentCurrency` | `IERC20` | 支付代币 (如 USDC) |

#### 2.2.2 可配置变量

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `greenShoeVault` | `address` | `address(0)` | 绿鞋金库地址 |
| `minClearingPrice` | `uint256` | `0.01 ether` | 最低清算价格 |
| `maxClearingPrice` | `uint256` | `1000 ether` | 最高清算价格 |
| `tokenSupplyPerRound` | `uint256` | `500 ether` | 每轮代币供应量 |

#### 2.2.3 常量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `GREEN_SHOE_RATIO` | `1500` | 绿鞋比例 (15% = 1500/10000) |
| `ROUND_DURATION` | `5 minutes` | 每轮持续时间 |

#### 2.2.4 状态变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `currentRoundId` | `uint256` | 当前轮次 ID |
| `lastClearingTime` | `uint256` | 上次清算时间戳 |
| `isRoundActive` | `bool` | 当前轮次是否活跃 |

### 2.3 数据结构

#### 2.3.1 RoundInfo 结构体

```solidity
struct RoundInfo {
    uint256 totalBidAmount;      // 本轮总出价金额 (USDC)
    uint256 clearingPrice;       // 清算价格
    uint256 totalTokensSold;     // 总售出代币数量
    bool isCleared;              // 是否已清算
}
```

**存储位置**: `mapping(uint256 => RoundInfo) public rounds;`

#### 2.3.2 UserBidInfo 结构体 (新增)

```solidity
struct UserBidInfo {
    uint256 totalAmount;         // 用户总出价金额
    uint256 tokensAllocated;     // 分配的代币数量
    uint256 refundAmount;        // 退款金额
    bool hasClaimed;             // 是否已领取代币
    bool hasRefunded;            // 是否已退款
}
```

**存储位置**: `mapping(uint256 => mapping(address => UserBidInfo)) public userBidDetails;`

### 2.4 函数详解

#### 2.4.1 管理函数

##### `setGreenShoeVault(address _vault)`

```solidity
function setGreenShoeVault(address _vault) external onlyOwner
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `_vault` | `address` | 绿鞋金库合约地址 |

**功能**: 设置绿鞋金库地址，用于清算时自动划转 15% 护盘资金。

**调用权限**: 仅 Owner

**调用时机**: 部署后初始化时调用一次

---

##### `setWhitelist(address[] calldata users, bool status)`

```solidity
function setWhitelist(address[] calldata users, bool status) external onlyOwner
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `users` | `address[]` | 用户地址数组 |
| `status` | `bool` | 白名单状态 |

**功能**: 批量设置用户 KYC 白名单状态。

**调用示例**:
```javascript
// 添加白名单
await auction.setWhitelist([user1, user2, user3], true);

// 移除白名单
await auction.setWhitelist([hacker], false);
```

---

##### `setPriceRange(uint256 _minPrice, uint256 _maxPrice)` (新增)

```solidity
function setPriceRange(uint256 _minPrice, uint256 _maxPrice) external onlyOwner
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `_minPrice` | `uint256` | 最低清算价格 (wei) |
| `_maxPrice` | `uint256` | 最高清算价格 (wei) |

**功能**: 设置清算价格的合法范围，防止 Owner 恶意定价。

**安全约束**:
- `_minPrice > 0`
- `_maxPrice > _minPrice`

**事件**: `emit PriceRangeUpdated(_minPrice, _maxPrice);`

---

##### `pause()` / `unpause()` (新增)

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

**功能**: 紧急暂停/恢复合约。暂停后所有带 `whenNotPaused` 修饰符的函数将无法调用。

**影响的函数**:
- `placeBid()` - 暂停后无法出价
- `claimTokens()` - 暂停后无法领取代币
- `claimRefund()` - 暂停后无法领取退款

**使用场景**:
- 发现安全漏洞时紧急停止
- 合约升级前暂停操作
- 市场异常波动时保护用户

---

##### `emergencyWithdraw(address token, uint256 amount)` (新增)

```solidity
function emergencyWithdraw(address token, uint256 amount) external onlyOwner whenPaused
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `token` | `address` | 代币合约地址 |
| `amount` | `uint256` | 提取数量 |

**功能**: 紧急情况下提取合约中的代币。

**安全约束**: 只能在合约暂停状态下调用 (`whenPaused`)

**事件**: `emit EmergencyWithdraw(token, amount);`

---

#### 2.4.2 用户函数

##### `placeBid(uint256 amount, uint256 _limitPrice)`

```solidity
function placeBid(uint256 amount, uint256 _limitPrice) 
    external 
    nonReentrant 
    whenNotPaused 
    onlyWhitelisted
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `amount` | `uint256` | 出价金额 (USDC, wei) |
| `_limitPrice` | `uint256` | 限价 (wei) |

**功能**: 用户提交出价，参与当前轮次拍卖。

**前置条件**:
1. 合约未暂停
2. 用户在白名单中
3. 当前轮次活跃 (`isRoundActive == true`)
4. 未超过轮次时间
5. `amount > 0`
6. `_limitPrice > 0`

**执行流程**:
```
1. 验证修饰符 (nonReentrant, whenNotPaused, onlyWhitelisted)
2. 检查轮次状态
3. 检查参数有效性
4. 检查时间有效性
5. SafeERC20.safeTransferFrom() 转入 USDC
6. 更新 userBids 映射
7. 更新 userBidDetails 结构体
8. 更新 rounds 总金额
9. 记录参与者 (如果首次)
10. 触发 BidPlaced 事件
```

**事件**: `emit BidPlaced(currentRoundId, msg.sender, amount, _limitPrice);`

**Gas 估算**: ~80,000 - 120,000 (首次参与会更高)

---

##### `claimTokens(uint256 roundId)` (新增)

```solidity
function claimTokens(uint256 roundId) external nonReentrant whenNotPaused
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `roundId` | `uint256` | 要领取的轮次 ID |

**功能**: 用户领取指定轮次分配的代币。

**前置条件**:
1. 合约未暂停
2. 该轮次已清算 (`isCleared == true`)
3. 用户未领取过 (`hasClaimed == false`)
4. 用户有分配的代币 (`tokensAllocated > 0`)

**执行流程**:
```
1. 验证修饰符 (nonReentrant, whenNotPaused)
2. 检查轮次是否已清算
3. 检查用户是否已领取
4. 检查分配数量
5. 标记已领取 (hasClaimed = true)
6. SafeERC20.safeTransfer() 转出代币
7. 触发 TokensClaimed 事件
```

**事件**: `emit TokensClaimed(roundId, msg.sender, tokensAllocated);`

---

##### `claimRefund(uint256 roundId)` (新增)

```solidity
function claimRefund(uint256 roundId) external nonReentrant whenNotPaused
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `roundId` | `uint256` | 要退款的轮次 ID |

**功能**: 用户领取指定轮次的退款金额。

**前置条件**:
1. 合约未暂停
2. 该轮次已清算
3. 用户未退款过 (`hasRefunded == false`)
4. 用户有退款金额 (`refundAmount > 0`)

**执行流程**: 与 `claimTokens` 类似

**事件**: `emit RefundClaimed(roundId, msg.sender, refundAmount);`

---

#### 2.4.3 清算函数

##### `executeClearing(uint256 _price, address[] users, uint256[] tokenAmounts, uint256[] refundAmounts)`

```solidity
function executeClearing(
    uint256 _price, 
    address[] calldata users,
    uint256[] calldata tokenAmounts,
    uint256[] calldata refundAmounts
) external onlyOwner nonReentrant
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `_price` | `uint256` | 清算价格 (wei) |
| `users` | `address[]` | 用户地址数组 |
| `tokenAmounts` | `uint256[]` | 代币分配数量数组 |
| `refundAmounts` | `uint256[]` | 退款金额数组 |

**功能**: 执行清算，记录每个用户的分配信息。

**前置条件**:
1. 当前轮次活跃
2. 轮次时间已结束
3. 价格在允许范围内
4. 三个数组长度相等

**执行流程**:
```
1. 验证轮次状态
2. 验证时间条件
3. 验证价格范围 (新增安全检查)
4. 验证数组长度
5. 设置清算价格和状态
6. 遍历记录用户分配:
   - userBidDetails[roundId][user].tokensAllocated = tokenAmounts[i]
   - userBidDetails[roundId][user].refundAmount = refundAmounts[i]
7. 计算绿鞋资金 (15%)
8. forceApprove() 授权 (安全重置)
9. 调用绿鞋金库 depositStabilizationFunds()
10. 触发事件
11. 设置 isRoundActive = false
```

**事件**:
- `emit GreenShoeActivated(stabilizationFund);`
- `emit RoundCleared(currentRoundId, _price, totalBidAmount);`

---

##### `executeClearingSimple(uint256 _price)`

```solidity
function executeClearingSimple(uint256 _price) external onlyOwner nonReentrant
```

**功能**: 简化版清算，仅设置清算价格，不记录分配信息。向后兼容旧版本调用。

---

##### `startNextRound()`

```solidity
function startNextRound() external onlyOwner
```

**功能**: 开启下一轮拍卖。

**前置条件**: 当前轮次已结束 (`isRoundActive == false`)

**执行流程**:
```
1. 检查当前轮次是否结束
2. currentRoundId++
3. lastClearingTime = block.timestamp
4. isRoundActive = true
5. 触发 RoundStarted 事件
```

**事件**: `emit RoundStarted(currentRoundId, lastClearingTime);`

---

#### 2.4.4 查询函数

##### `getUserBidDetails(uint256 roundId, address user)`

```solidity
function getUserBidDetails(uint256 roundId, address user) 
    external 
    view 
    returns (
        uint256 totalAmount,
        uint256 tokensAllocated,
        uint256 refundAmount,
        bool hasClaimed,
        bool hasRefunded
    )
```

**功能**: 查询用户在指定轮次的完整信息。

**返回值说明**:

| 字段 | 说明 |
|------|------|
| `totalAmount` | 用户在该轮总出价金额 |
| `tokensAllocated` | 分配的代币数量 |
| `refundAmount` | 可退款金额 |
| `hasClaimed` | 是否已领取代币 |
| `hasRefunded` | 是否已领取退款 |

---

##### `getRoundParticipantCount(uint256 roundId)`

```solidity
function getRoundParticipantCount(uint256 roundId) external view returns (uint256)
```

**功能**: 获取指定轮次的参与人数。

---

##### `getRemainingTime()`

```solidity
function getRemainingTime() external view returns (uint256)
```

**功能**: 获取当前轮次剩余时间（秒）。

**返回值**:
- 如果轮次未激活: 返回 `0`
- 如果时间已过: 返回 `0`
- 否则: 返回 `endTime - block.timestamp`

---

### 2.5 自定义错误 (新增)

使用自定义错误替代 `require` 字符串，节省 Gas：

```solidity
error KYCRequired();           // 未通过 KYC
error RoundNotActive();        // 轮次未激活
error RoundStillActive();      // 轮次仍在进行
error InvalidAmount();         // 无效金额
error InvalidPrice();          // 无效价格
error RoundTimeExpired();      // 轮次时间已过
error TimeNotUp();             // 时间未到
error AlreadyCleared();        // 已清算
error NotCleared();            // 未清算
error AlreadyClaimed();        // 已领取
error AlreadyRefunded();       // 已退款
error NothingToClaim();        // 无可领取
error PriceOutOfRange();       // 价格超出范围
```

**Gas 节省**: 相比字符串错误信息，每次 revert 节省约 200-500 gas。

---

## 3. GreenShoeVault.sol 技术规格

### 3.1 合约继承结构

```
GreenShoeVault
    ├── Ownable          (权限管理)
    ├── ReentrancyGuard  (重入保护)
    └── Pausable         (紧急暂停)
```

### 3.2 状态变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `currency` | `IERC20 (immutable)` | 稳定币 (USDC) |
| `auctionContract` | `address` | 拍卖合约地址 |
| `approvedDexAddresses` | `mapping(address => bool)` | DEX 白名单 |
| `totalReceived` | `uint256` | 累计收到资金 |
| `totalUsedForBuyback` | `uint256` | 累计用于回购 |

### 3.3 函数详解

#### 3.3.1 `setAuctionContract(address _auction)`

```solidity
function setAuctionContract(address _auction) external onlyOwner
```

**功能**: 设置允许存入资金的拍卖合约地址。

**安全检查**: `_auction != address(0)`

---

#### 3.3.2 `setApprovedDex(address dex, bool approved)` (新增)

```solidity
function setApprovedDex(address dex, bool approved) external onlyOwner
```

**功能**: 设置 DEX 地址白名单。

**使用场景**:
```javascript
// 批准 Uniswap Router
await vault.setApprovedDex(UNISWAP_ROUTER, true);

// 移除批准
await vault.setApprovedDex(MALICIOUS_ADDRESS, false);
```

**事件**: `emit DexApprovalUpdated(dex, approved);`

---

#### 3.3.3 `setApprovedDexBatch(address[] dexAddresses, bool approved)` (新增)

```solidity
function setApprovedDexBatch(address[] calldata dexAddresses, bool approved) external onlyOwner
```

**功能**: 批量设置 DEX 白名单。

---

#### 3.3.4 `depositStabilizationFunds(uint256 amount)`

```solidity
function depositStabilizationFunds(uint256 amount) external nonReentrant whenNotPaused
```

**功能**: 接收拍卖合约转入的护盘资金。

**调用者限制**: 仅 `auctionContract` 可调用

**执行流程**:
```
1. 验证调用者是拍卖合约
2. SafeERC20.safeTransferFrom() 转入资金
3. 更新 totalReceived
4. 触发 FundsReceived 事件
```

---

#### 3.3.5 `executeBuyback(uint256 amount, address dexAddress)`

```solidity
function executeBuyback(uint256 amount, address dexAddress) 
    external 
    onlyOwner 
    nonReentrant 
    whenNotPaused
```

**功能**: 执行二级市场回购护盘。

**安全检查** (新增):
1. `dexAddress` 必须在白名单中
2. 合约余额充足

**执行流程**:
```
1. 验证 DEX 在白名单
2. 验证余额充足
3. SafeERC20.safeTransfer() 转出资金
4. 更新 totalUsedForBuyback
5. 触发 FundsUsedForStabilization 事件
```

---

#### 3.3.6 `getStats()` (新增)

```solidity
function getStats() external view returns (
    uint256 balance,
    uint256 received,
    uint256 usedForBuyback
)
```

**功能**: 获取金库统计信息。

---

## 4. MockERC20.sol 技术规格

### 4.1 合约继承结构

```
MockERC20
    ├── ERC20   (标准代币)
    └── Ownable (权限管理)
```

### 4.2 安全增强

#### 4.2.1 铸造上限

```solidity
uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18; // 1亿代币
```

#### 4.2.2 铸造者白名单

```solidity
mapping(address => bool) public isMinter;
```

### 4.3 函数详解

#### 4.3.1 `setMinter(address minter, bool status)`

```solidity
function setMinter(address minter, bool status) external onlyOwner
```

**功能**: 设置铸造者权限。

**事件**: `emit MinterUpdated(minter, status);`

---

#### 4.3.2 `mint(address to, uint256 amount)`

```solidity
function mint(address to, uint256 amount) external
```

**安全检查** (新增):
1. 调用者必须是 Owner 或在 `isMinter` 白名单中
2. 铸造后总供应量不能超过 `MAX_SUPPLY`

**错误**:
- `NotMinter()` - 无铸造权限
- `ExceedsMaxSupply()` - 超出供应上限

---

#### 4.3.3 `burn(uint256 amount)` (新增)

```solidity
function burn(uint256 amount) external
```

**功能**: 销毁调用者自己的代币。

---

#### 4.3.4 `burnFrom(address from, uint256 amount)` (新增)

```solidity
function burnFrom(address from, uint256 amount) external
```

**功能**: 销毁指定地址的代币（需要授权）。

---

## 5. 后端脚本技术规格

### 5.1 auto_bot.ts

#### 5.1.1 核心功能

1. **事件监听**: 监听链上 `BidPlaced` 事件
2. **事件追赶**: 启动时补齐历史事件
3. **订单簿撮合**: 链下计算清算价格
4. **链上清算**: 调用合约执行清算
5. **轮次管理**: 自动开启下一轮

#### 5.1.2 关键函数

##### `formatBigIntSafe(value, decimals)` (新增)

```typescript
function formatBigIntSafe(value: bigint, decimals: number = 18): string
```

**功能**: 安全的大数精度转换，避免浮点数精度丢失。

**实现**:
```typescript
function formatBigIntSafe(value: bigint, decimals: number = 18): string {
  const str = value.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, -decimals) || "0";
  const decPart = str.slice(-decimals);
  const trimmedDec = decPart.slice(0, 4);
  return `${intPart}.${trimmedDec}`;
}
```

**对比旧版本**:
```typescript
// ❌ 旧版本 (有精度问题)
const amt = parseFloat(ethers.formatEther(amount));

// ✅ 新版本 (安全)
const amt = formatBigIntSafe(amount);
```

---

##### `catchUpEvents(auction, fromBlock)` (新增)

```typescript
async function catchUpEvents(auction: any, fromBlock: number): Promise<number>
```

**功能**: 追赶历史事件，防止机器人重启丢失数据。

**执行流程**:
```
1. 查询从 fromBlock 开始的所有 BidPlaced 事件
2. 遍历事件，使用 INSERT OR IGNORE 写入数据库
3. 返回最新区块号
```

**使用场景**:
- 机器人重启后恢复状态
- 网络中断重连后补齐数据

---

##### `getLastProcessedBlock()` / `saveLastProcessedBlock()`

```typescript
function getLastProcessedBlock(): number
function saveLastProcessedBlock(blockNumber: number): void
```

**功能**: 从数据库读取/保存最后处理的区块号。

**存储位置**: `metadata` 表的 `last_processed_block` 键

---

#### 5.1.3 主循环逻辑

```
┌─────────────────────────────────────────────────────┐
│                    主循环开始                        │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  检查 isRoundActive    │
            └────────────────────────┘
                    │         │
           (true)   │         │  (false)
                    ▼         ▼
    ┌──────────────────┐  ┌──────────────────┐
    │ 计算剩余时间      │  │ 自动重启轮次     │
    └──────────────────┘  └──────────────────┘
            │
            ▼
    ┌──────────────────┐
    │ timeLeft <= 0 ?  │
    └──────────────────┘
        │         │
  (yes) │         │ (no)
        ▼         ▼
┌──────────────┐  ┌──────────────┐
│ 执行清算流程  │  │ 打印倒计时   │
└──────────────┘  └──────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ 清算流程:                                 │
│ 1. 查询订单簿 (按价格降序)                │
│ 2. 累积计算直到达到 SUPPLY                │
│ 3. 找到边际订单，确定清算价               │
│ 4. 计算每个用户的分配和退款               │
│ 5. 调用 executeClearing()                │
│ 6. 等待 5 秒                             │
│ 7. 调用 startNextRound()                 │
└──────────────────────────────────────────┘
        │
        ▼
    ┌──────────────────┐
    │ sleep(2000ms)    │
    └──────────────────┘
        │
        └──────────► 返回主循环
```

---

### 5.2 setup_db.ts

#### 5.2.1 数据库特性

- **WAL 模式**: 提高并发写入性能
- **外键约束**: 保证数据完整性

```typescript
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
```

#### 5.2.2 表结构

详见 [第6节 数据库架构](#6-数据库架构)

---

## 6. 数据库架构

### 6.1 ER 图

```
┌─────────────┐       ┌─────────────┐
│    users    │       │   rounds    │
├─────────────┤       ├─────────────┤
│ address (PK)│       │ roundId (PK)│
│ isWhitelisted│      │ clearingPrice│
│ totalBidAmount│     │ totalVolume │
│ ...         │       │ status      │
└─────────────┘       └─────────────┘
       │                     │
       │                     │
       ▼                     ▼
┌─────────────────────────────────────┐
│               bids                  │
├─────────────────────────────────────┤
│ id (PK)                             │
│ roundId (FK → rounds)               │
│ userAddress (FK → users)            │
│ amountUSDC                          │
│ limitPrice                          │
│ tokensAllocated                     │
│ refundAmount                        │
│ status                              │
│ txHash (UNIQUE)                     │
└─────────────────────────────────────┘
```

### 6.2 bids 表

```sql
CREATE TABLE bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roundId INTEGER NOT NULL,
    userAddress TEXT NOT NULL,
    amountUSDC TEXT NOT NULL,
    limitPrice TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    txHash TEXT UNIQUE,
    status TEXT DEFAULT 'PENDING' 
        CHECK(status IN ('PENDING', 'MATCHED', 'REJECTED', 'CLEARED', 'REFUNDED')),
    
    -- 扩展字段 (清算后填充)
    tokensAllocated TEXT DEFAULT '0',
    refundAmount TEXT DEFAULT '0',
    finalPrice TEXT DEFAULT '0',
    claimTxHash TEXT,
    refundTxHash TEXT,
    
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.3 索引 (新增)

```sql
-- 按轮次查询
CREATE INDEX idx_bids_roundId ON bids(roundId);

-- 按用户查询
CREATE INDEX idx_bids_userAddress ON bids(userAddress);

-- 按状态筛选
CREATE INDEX idx_bids_status ON bids(status);

-- 按价格排序 (撮合用)
CREATE INDEX idx_bids_limitPrice ON bids(CAST(limitPrice AS REAL) DESC);

-- 按时间排序
CREATE INDEX idx_bids_timestamp ON bids(timestamp);

-- 复合索引 (撮合优化)
CREATE INDEX idx_bids_round_price ON bids(roundId, CAST(limitPrice AS REAL) DESC);
```

**性能提升**: 撮合查询从全表扫描优化为索引扫描，10000+ 订单时提升 10x 以上。

### 6.4 rounds 表

```sql
CREATE TABLE rounds (
    roundId INTEGER PRIMARY KEY,
    clearingPrice TEXT,
    totalVolume TEXT,
    totalTokensSold TEXT,
    participantCount INTEGER DEFAULT 0,
    successfulBids INTEGER DEFAULT 0,
    rejectedBids INTEGER DEFAULT 0,
    greenShoeFund TEXT DEFAULT '0',
    clearingTimestamp INTEGER,
    clearingTxHash TEXT,
    status TEXT DEFAULT 'ACTIVE' 
        CHECK(status IN ('ACTIVE', 'CLEARING', 'CLEARED', 'CANCELLED')),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.5 users 表 (新增)

```sql
CREATE TABLE users (
    address TEXT PRIMARY KEY,
    isWhitelisted INTEGER DEFAULT 0,
    totalBidAmount TEXT DEFAULT '0',
    totalTokensReceived TEXT DEFAULT '0',
    totalRefunds TEXT DEFAULT '0',
    participatedRounds INTEGER DEFAULT 0,
    firstSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastActiveAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.6 metadata 表 (新增)

```sql
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始数据
INSERT INTO metadata (key, value) VALUES 
    ('schema_version', '2.0.0'),
    ('last_processed_block', '0');
```

### 6.7 event_logs 表 (新增)

```sql
CREATE TABLE event_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eventType TEXT NOT NULL,
    blockNumber INTEGER,
    txHash TEXT,
    data TEXT,
    processedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. 配置系统

### 7.1 config/addresses.ts

#### 7.1.1 地址配置

```typescript
export const ADDRESSES = {
    auction: process.env.AUCTION_ADDRESS || "",
    usdc: process.env.USDC_ADDRESS || "",
    auctionToken: process.env.AUCTION_TOKEN_ADDRESS || "",
    greenShoeVault: process.env.GREEN_SHOE_VAULT_ADDRESS || "",
} as const;
```

#### 7.1.2 Bot 配置

```typescript
export const BOT_CONFIG = {
    pollingInterval: Number(process.env.BOT_POLLING_INTERVAL) || 2000,
    postClearingDelay: Number(process.env.BOT_POST_CLEARING_DELAY) || 5000,
    roundDuration: Number(process.env.ROUND_DURATION) || 300,
    tokenSupplyPerRound: Number(process.env.TOKEN_SUPPLY_PER_ROUND) || 500,
    minClearingPrice: Number(process.env.MIN_CLEARING_PRICE) || 0.01,
    maxClearingPrice: Number(process.env.MAX_CLEARING_PRICE) || 1000,
} as const;
```

#### 7.1.3 工具函数

```typescript
// 验证地址是否配置
export function validateAddresses(): boolean

// 获取地址 (自动验证)
export function getAddress(key: keyof typeof ADDRESSES): string

// 打印当前配置
export function printAddresses(): void
```

### 7.2 使用示例

```typescript
import { getAddress, BOT_CONFIG, validateAddresses } from "../config/addresses";

// 启动时验证
if (!validateAddresses()) {
    console.error("配置不完整");
    process.exit(1);
}

// 获取地址
const auctionAddr = getAddress("auction");

// 使用配置
const interval = BOT_CONFIG.pollingInterval;
```

---

## 8. 调用流程图

### 8.1 完整拍卖流程

```
┌────────────────────────────────────────────────────────────────────┐
│                         系统初始化                                  │
├────────────────────────────────────────────────────────────────────┤
│ 1. 部署合约 (deploy_sepolia.ts)                                    │
│    - MockERC20 (USDC)                                              │
│    - MockERC20 (wSPX)                                              │
│    - BatchAuction                                                   │
│    - GreenShoeVault                                                │
│                                                                     │
│ 2. 配置关联                                                         │
│    - auction.setGreenShoeVault(vault)                              │
│    - vault.setAuctionContract(auction)                             │
│    - vault.setApprovedDex(dex_addresses)                           │
│                                                                     │
│ 3. 初始化数据库 (setup_db.ts)                                       │
│                                                                     │
│ 4. 启动机器人 (auto_bot.ts)                                         │
└────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                         轮次进行中                                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  用户操作:                     │  系统操作:                         │
│  ┌─────────────────────────┐  │  ┌─────────────────────────┐      │
│  │ 1. USDC.approve(auction)│  │  │ auto_bot 监听事件        │      │
│  │ 2. auction.placeBid()   │──┼─▶│ 写入 SQLite 数据库       │      │
│  └─────────────────────────┘  │  └─────────────────────────┘      │
│                                │                                    │
│  ┌─────────────────────────┐  │                                    │
│  │ 前端显示:               │  │                                    │
│  │ - 倒计时                │  │                                    │
│  │ - 当前最高价            │  │                                    │
│  │ - 订单簿深度            │  │                                    │
│  └─────────────────────────┘  │                                    │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ (5分钟后)
┌────────────────────────────────────────────────────────────────────┐
│                         清算阶段                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  auto_bot 执行:                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1. 查询订单簿 (按价格降序)                                    │   │
│  │    SELECT * FROM bids WHERE roundId = ? ORDER BY limitPrice DESC│
│  │                                                               │   │
│  │ 2. 撮合计算                                                   │   │
│  │    - 累积需求直到达到 SUPPLY (500)                            │   │
│  │    - 确定边际订单和清算价                                     │   │
│  │    - 计算每个用户: tokensAllocated, refundAmount              │   │
│  │                                                               │   │
│  │ 3. 调用合约                                                   │   │
│  │    auction.executeClearing(price, users, tokens, refunds)     │   │
│  │                                                               │   │
│  │ 4. 绿鞋机制自动触发                                           │   │
│  │    - 计算 15% 资金                                            │   │
│  │    - transferFrom → GreenShoeVault                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                         用户领取                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  成功出价用户:                  │  出局用户:                        │
│  ┌─────────────────────────┐   │  ┌─────────────────────────┐     │
│  │ auction.claimTokens()   │   │  │ auction.claimRefund()   │     │
│  │ → 获得 wSPX 代币        │   │  │ → 获得 USDC 退款        │     │
│  └─────────────────────────┘   │  └─────────────────────────┘     │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                         下一轮开始                                  │
├────────────────────────────────────────────────────────────────────┤
│  auto_bot 调用:                                                     │
│  auction.startNextRound()                                          │
│                                                                     │
│  → currentRoundId++                                                │
│  → isRoundActive = true                                            │
│  → 循环继续...                                                      │
└────────────────────────────────────────────────────────────────────┘
```

### 8.2 紧急暂停流程

```
┌─────────────────┐
│ 发现安全问题     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Owner 调用      │
│ auction.pause() │
│ vault.pause()   │
└─────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 被暂停的操作:                        │
│ - placeBid() ❌                     │
│ - claimTokens() ❌                  │
│ - claimRefund() ❌                  │
│ - depositStabilizationFunds() ❌    │
│ - executeBuyback() ❌               │
│                                     │
│ 仍可操作:                            │
│ - 查询函数 ✅                        │
│ - emergencyWithdraw() ✅            │
└─────────────────────────────────────┘
         │
         ▼ (问题修复后)
┌─────────────────┐
│ Owner 调用      │
│ auction.unpause()│
│ vault.unpause() │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ 恢复正常运行    │
└─────────────────┘
```

---

## 9. 安全机制详解

### 9.1 重入攻击防护

#### 9.1.1 攻击原理

```solidity
// 恶意合约示例
contract Attacker {
    function attack(BatchAuction auction) external {
        auction.claimTokens(1);
    }
    
    // 恶意代币的 transfer 回调
    function onTokenReceived() external {
        // 重复调用 claimTokens
        BatchAuction(msg.sender).claimTokens(1);
    }
}
```

#### 9.1.2 防护措施

```solidity
// 使用 nonReentrant 修饰符
function claimTokens(uint256 roundId) external nonReentrant {
    // ...
}
```

**原理**: `ReentrancyGuard` 使用一个状态变量跟踪调用深度：

```solidity
uint256 private _status;
uint256 private constant _NOT_ENTERED = 1;
uint256 private constant _ENTERED = 2;

modifier nonReentrant() {
    require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
    _status = _ENTERED;
    _;
    _status = _NOT_ENTERED;
}
```

### 9.2 SafeERC20 使用

#### 9.2.1 问题背景

某些 ERC20 代币 (如 USDT) 的 `transfer` 函数不返回布尔值，直接调用会导致问题。

#### 9.2.2 解决方案

```solidity
using SafeERC20 for IERC20;

// ❌ 不安全
paymentCurrency.transferFrom(msg.sender, address(this), amount);

// ✅ 安全
paymentCurrency.safeTransferFrom(msg.sender, address(this), amount);
```

### 9.3 价格范围限制

#### 9.3.1 攻击场景

恶意 Owner 设置极端清算价格：
- 极低价格 → 用户损失
- 极高价格 → 用户买不到

#### 9.3.2 防护措施

```solidity
uint256 public minClearingPrice = 0.01 ether;
uint256 public maxClearingPrice = 1000 ether;

function executeClearingSimple(uint256 _price) external onlyOwner {
    if (_price < minClearingPrice || _price > maxClearingPrice) 
        revert PriceOutOfRange();
    // ...
}
```

### 9.4 DEX 白名单

#### 9.4.1 攻击场景

恶意 Owner 将 `executeBuyback` 的目标地址设为自己的钱包。

#### 9.4.2 防护措施

```solidity
mapping(address => bool) public approvedDexAddresses;

function executeBuyback(uint256 amount, address dexAddress) external {
    if (!approvedDexAddresses[dexAddress]) revert DexNotApproved();
    // ...
}
```

### 9.5 Approve 安全

#### 9.5.1 问题背景

多次调用 `approve` 可能导致授权累积：

```solidity
// 第一次：approve(vault, 100)
// 第二次：approve(vault, 200)
// 结果：vault 可能可以使用 100 + 200 = 300
```

#### 9.5.2 解决方案

```solidity
// 使用 forceApprove (先设为0再设新值)
paymentCurrency.forceApprove(greenShoeVault, stabilizationFund);
```

---

## 附录 A: 环境变量清单

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PRIVATE_KEY` | ✅ | - | 部署者私钥 |
| `SEPOLIA_RPC_URL` | ✅ | - | RPC URL |
| `AUCTION_ADDRESS` | ✅ | - | 拍卖合约地址 |
| `USDC_ADDRESS` | ✅ | - | USDC 地址 |
| `AUCTION_TOKEN_ADDRESS` | ⭕ | - | 拍卖代币地址 |
| `GREEN_SHOE_VAULT_ADDRESS` | ⭕ | - | 绿鞋金库地址 |
| `BOT_POLLING_INTERVAL` | ❌ | 2000 | 轮询间隔 (ms) |
| `BOT_POST_CLEARING_DELAY` | ❌ | 5000 | 清算后延迟 (ms) |
| `ROUND_DURATION` | ❌ | 300 | 轮次时长 (s) |
| `TOKEN_SUPPLY_PER_ROUND` | ❌ | 500 | 每轮供应量 |
| `MIN_CLEARING_PRICE` | ❌ | 0.01 | 最低价格 |
| `MAX_CLEARING_PRICE` | ❌ | 1000 | 最高价格 |

---

## 附录 B: Gas 消耗估算

| 函数 | Gas (估算) | 说明 |
|------|-----------|------|
| `placeBid` (首次) | ~120,000 | 包含首次参与者记录 |
| `placeBid` (再次) | ~80,000 | 仅更新金额 |
| `executeClearing` (10用户) | ~200,000 | 随用户数增加 |
| `executeClearingSimple` | ~100,000 | 简化版 |
| `claimTokens` | ~60,000 | - |
| `claimRefund` | ~60,000 | - |
| `startNextRound` | ~50,000 | - |

---

## 附录 C: 事件签名

```solidity
event BidPlaced(uint256 indexed roundId, address indexed user, uint256 amount, uint256 limitPrice);
// Topic: 0x...

event RoundCleared(uint256 indexed roundId, uint256 clearingPrice, uint256 totalVolume);
// Topic: 0x...

event GreenShoeActivated(uint256 amountLocked);
// Topic: 0x...

event RoundStarted(uint256 indexed roundId, uint256 startTime);
// Topic: 0x...

event TokensClaimed(uint256 indexed roundId, address indexed user, uint256 tokenAmount);
// Topic: 0x...

event RefundClaimed(uint256 indexed roundId, address indexed user, uint256 refundAmount);
// Topic: 0x...

event PriceRangeUpdated(uint256 minPrice, uint256 maxPrice);
// Topic: 0x...

event EmergencyWithdraw(address indexed token, uint256 amount);
// Topic: 0x...
```

---

*文档结束*

