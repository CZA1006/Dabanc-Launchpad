# 动态供应量机制说明

## 📋 概述

本系统实现了**智能动态供应量调整机制**，结合了固定总供应量的 RWA 约束和灵活的市场响应能力。

## 🎯 核心特性

### 1. 总量限制（RWA 约束）
- ✅ 设置代币总供应上限（如 1000 万个）
- ✅ 防止超发，保护资产价值
- ✅ 实时追踪已发行量和剩余量
- ✅ 当接近总量时自动限制供应

### 2. 动态供应调整
根据上一轮的清算价格自动调整下一轮供应量：

| 场景 | 价格 | 供应调整 | 原因 |
|------|------|---------|------|
| **需求过热** | 高于目标价 + 容忍度 | 📈 增加供应 | 供不应求，增加供应平抑价格 |
| **需求不足** | 低于目标价 - 容忍度 | 📉 减少供应 | 供过于求，减少供应支撑价格 |
| **价格合理** | 在目标价范围内 | ➡️ 保持不变 | 市场平衡，无需调整 |

### 3. 安全边界
- ✅ 每次调整有固定步长（默认 50 个）
- ✅ 最低供应量保护（不会减到 0）
- ✅ 最大供应量限制（不超过剩余总量）
- ✅ 价格容忍度可配置（默认 20%）

## 🔧 配置参数

```solidity
// 合约部署时设置
totalTokenSupply = 10,000,000 wSPX  // 总供应上限

// 动态参数（可由 Owner 调整）
targetPrice = 10 USDC              // 目标价格 $10
supplyAdjustmentStep = 50 wSPX     // 每次调整 50 个
priceTolerance = 20%               // 价格容忍度 ±20%
```

### 调整逻辑示例

**目标价格：$10，容忍度：20%**

```
上限价格 = $10 × 120% = $12
下限价格 = $10 × 80% = $8

如果清算价 > $12 → 供应 +50
如果清算价 < $8  → 供应 -50
如果 $8 ≤ 清算价 ≤ $12 → 不变
```

## 📊 测试结果

### 测试场景

| 轮次 | 清算价格 | 当前供应 | 调整 | 下轮供应 |
|------|---------|---------|------|---------|
| Round 1 | $25 (高) | 500 | +50 | 550 ✅ |
| Round 2 | $5 (低) | 550 | -50 | 500 ✅ |
| Round 3 | - | 500 | - | - |

**结果：**
- ✅ 价格过高时自动增加供应
- ✅ 价格过低时自动减少供应
- ✅ 总量始终不超过上限
- ✅ 已发行量准确追踪

## 🔌 前端集成

### 查询供应统计

```typescript
import { useReadContract } from 'wagmi';
import { AUCTION_ABI, AUCTION_ADDRESS } from './constants';

// 查询供应统计
const { data: stats } = useReadContract({
  address: AUCTION_ADDRESS,
  abi: AUCTION_ABI,
  functionName: 'getSupplyStats',
});

// stats 返回值：
// [0] total: 总供应量
// [1] issued: 已发行量
// [2] remaining: 剩余量
// [3] currentRound: 当前轮次供应
// [4] progress: 发行进度（百分比 × 100）

const totalSupply = Number(formatEther(stats[0]));
const issuedSupply = Number(formatEther(stats[1]));
const remainingSupply = Number(formatEther(stats[2]));
const currentRoundSupply = Number(formatEther(stats[3]));
const progressPercent = Number(stats[4]) / 100; // 转换为百分比
```

### 查询动态配置

```typescript
const { data: config } = useReadContract({
  address: AUCTION_ADDRESS,
  abi: AUCTION_ABI,
  functionName: 'getDynamicSupplyConfig',
});

// config 返回值：
// [0] target: 目标价格
// [1] step: 调整步长
// [2] tolerance: 价格容忍度

const targetPrice = Number(formatEther(config[0]));
const adjustmentStep = Number(formatEther(config[1]));
const tolerance = Number(config[2]); // 百分比
```

### UI 显示建议

```tsx
<div className="supply-stats">
  <h3>供应量统计</h3>
  <div>总供应: {totalSupply.toLocaleString()} wSPX</div>
  <div>已发行: {issuedSupply.toLocaleString()} wSPX</div>
  <div>剩余量: {remainingSupply.toLocaleString()} wSPX</div>
  <div>发行进度: {progressPercent}%</div>
  
  <div className="progress-bar">
    <div style={{ width: `${progressPercent}%` }} />
  </div>
  
  <h3>当前轮次</h3>
  <div>本轮供应: {currentRoundSupply} wSPX</div>
  <div>目标价格: ${targetPrice}</div>
</div>
```

## 🎮 管理函数

### Owner 可调整的参数

```typescript
// 1. 设置动态供应参数
await auction.setDynamicSupplyParams(
  ethers.parseEther("10"),   // 目标价格 $10
  ethers.parseEther("50"),   // 调整步长 50
  20                          // 容忍度 20%
);

// 2. 手动设置总供应量（必须 ≥ 已发行量）
await auction.setTotalTokenSupply(
  ethers.parseEther("20000000")  // 增加到 2000 万
);

// 3. 手动设置当前轮供应（覆盖自动调整）
await auction.setTokenSupplyPerRound(
  ethers.parseEther("1000")  // 手动设为 1000 个
);
```

## 🚀 部署步骤

### 1. 重新部署合约

```bash
# 停止之前的 Anvil（如果在运行）
# Ctrl+C 停止

# 重新启动 Anvil
anvil

# 新终端：部署合约（会自动设置总供应量）
cd /Volumes/PortableSSD/DABANC/12.16-12.22/Dabanc-Launchpad
npx hardhat run scripts/deploy_sepolia.ts --network localhost
```

### 2. 记录新地址

部署成功后会输出：
```
✅ USDC 合约: 0x...
✅ wSPX 合约: 0x...
✅ Auction 合约: 0x...
   总供应量: 10000000.0 wSPX
```

### 3. 更新前端配置

编辑 `dabanc-frontend/src/constants.ts`：
```typescript
export const AUCTION_ADDRESS = "0x新的拍卖合约地址" as const;
export const USDC_ADDRESS = "0x新的USDC地址" as const;
```

### 4. 初始化数据库和白名单

```bash
# 初始化数据库
npx ts-node scripts/setup_db.ts

# 初始化拍卖环境（mint 代币、授权等）
npx hardhat run scripts/init_auction.ts --network localhost

# 添加白名单
npx hardhat run scripts/whitelist_user.ts --network localhost
```

### 5. 启动服务

```bash
# 终端 1: Anvil（已在运行）
anvil

# 终端 2: 清算机器人（可选）
npx hardhat run scripts/auto_bot.ts --network localhost

# 终端 3: 流量模拟器（可选）
npx hardhat run scripts/simulate_traffic.ts --network localhost

# 终端 4: 前端
cd dabanc-frontend
npm run dev
```

## 📈 优势对比

| 特性 | 传统固定供应 | 动态供应（本方案） |
|------|------------|------------------|
| **总量控制** | ✅ | ✅ |
| **市场响应** | ❌ 僵化 | ✅ 灵活 |
| **价格稳定** | ❌ 波动大 | ✅ 自动平衡 |
| **防止超发** | ✅ | ✅ 更严格 |
| **透明度** | ⚠️ 中等 | ✅ 链上可查 |

## ⚠️ 注意事项

1. **首次调整在 Round 2**
   - Round 1 没有历史价格，使用默认供应量
   - 从 Round 2 开始根据 Round 1 价格调整

2. **极端场景处理**
   - 接近总量上限时，供应自动限制为剩余量
   - 供应量不会减少到低于调整步长

3. **价格数据依赖**
   - 必须先执行清算才能开启下一轮
   - 清算价格必须在有效范围内

4. **权限管理**
   - 只有 Owner 可以调整参数
   - 建议生产环境使用多签钱包

## 🧪 测试

运行完整测试：
```bash
npx hardhat run scripts/test_dynamic_supply.ts --network hardhat
```

## 📞 技术支持

如有问题，请查看：
- 主文档：`README.md`
- 安全文档：`docs/SECURITY_UPGRADE_TECHNICAL_SPEC.md`
- 测试脚本：`scripts/test_dynamic_supply.ts`

---

**更新日期**: 2024-12  
**版本**: v2.1 - 动态供应量版本

