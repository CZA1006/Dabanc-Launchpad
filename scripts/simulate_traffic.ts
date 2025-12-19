/**
 * @file simulate_traffic.ts
 * @description 流量模拟器 - 支持本地和 Sepolia 网络（优化版）
 * @notice 减少 RPC 调用，提高稳定性
 */
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

// 从环境变量读取地址
const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
const USDC_ADDRESS = process.env.USDC_ADDRESS || "";

const CONFIG = {
  minPrice: 1, maxPrice: 20,
  minAmount: 100, maxAmount: 2000,
  // Sepolia 需要更长的间隔
  intervalMin: Number(process.env.SIMULATE_INTERVAL_MIN) || 8000,
  intervalMax: Number(process.env.SIMULATE_INTERVAL_MAX) || 20000,
  // 安全缓冲时间（秒）
  safeBuffer: 45,
  // 区块时间缓存（秒）- 避免每次都查询
  blockTimeCacheSeconds: 30,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 缓存区块时间，避免频繁 RPC 调用
let cachedBlockTime = 0;
let lastBlockFetch = 0;

async function getBlockTime(provider: any): Promise<number> {
  const now = Date.now();
  // 如果缓存有效（30秒内），直接返回估算值
  if (cachedBlockTime > 0 && (now - lastBlockFetch) < CONFIG.blockTimeCacheSeconds * 1000) {
    // 返回估算的当前区块时间
    return cachedBlockTime + Math.floor((now - lastBlockFetch) / 1000);
  }
  
  try {
    const latestBlock = await provider.getBlock('latest');
    if (latestBlock?.timestamp) {
      cachedBlockTime = Number(latestBlock.timestamp);
      lastBlockFetch = now;
      return cachedBlockTime;
    }
  } catch (e) {
    console.log("\n⚠️ 获取区块时间失败，使用本地时间");
  }
  
  // 回退到本地时间
  return Math.floor(now / 1000);
}

async function main() {
  if (!AUCTION_ADDRESS || !USDC_ADDRESS) {
    console.error("❌ 请在 .env 中配置 AUCTION_ADDRESS 和 USDC_ADDRESS");
    process.exit(1);
  }

  const network = await ethers.provider.getNetwork();
  console.log(`🤖 启动流量模拟器（优化版）`);
  console.log(`🌐 网络: ${network.name} (chainId: ${network.chainId})`);
  console.log(`📋 合约地址:`);
  console.log(`   Auction: ${AUCTION_ADDRESS}`);
  console.log(`   USDC: ${USDC_ADDRESS}`);
  
  // 获取所有可用签名者
  const signers = await ethers.getSigners();
  console.log(`👥 可用测试账户: ${signers.length} 个`);
  
  const [admin] = signers;
  console.log(`👤 管理员: ${admin.address}`);
  
  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);
  const usdc = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

  // 检查余额
  const usdcBalance = await usdc.balanceOf(admin.address);
  console.log(`💰 USDC 余额: ${ethers.formatEther(usdcBalance)}`);
  
  if (usdcBalance < ethers.parseEther("1000")) {
    console.log("⚠️  USDC 余额不足，尝试铸造...");
    try {
      const tx = await usdc.mint(admin.address, ethers.parseEther("100000"));
      await tx.wait();
      console.log("✅ 已铸造 100,000 USDC");
    } catch (e: any) {
      console.error("❌ 无法铸造 USDC:", e.message);
    }
  }

  // 检查授权（一次性授权最大值）
  const allowance = await usdc.allowance(admin.address, AUCTION_ADDRESS);
  if (allowance < ethers.parseEther("1000000")) {
    console.log("🔓 授权 USDC 给拍卖合约...");
    const tx = await usdc.approve(AUCTION_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log("✅ 授权完成");
  }

  // 检查白名单
  const isWhitelisted = await auction.isWhitelisted(admin.address);
  if (!isWhitelisted) {
    console.error("❌ 当前账户未在白名单中，请先运行:");
    console.error(`   npx hardhat run scripts/whitelist_user.ts --network ${network.name}`);
    process.exit(1);
  }

  // 本地网络：为多个测试账户准备资金和白名单
  if (network.chainId === 31337n && signers.length > 1) {
    console.log("\n📋 初始化本地测试账户...");
    const testAccounts = signers.slice(0, 5);
    
    for (const signer of testAccounts) {
      const balance = await usdc.balanceOf(signer.address);
      if (balance < ethers.parseEther("10000")) {
        await usdc.mint(signer.address, ethers.parseEther("100000"));
        console.log(`   💰 为 ${signer.address.slice(0,10)}... 铸造 USDC`);
      }
      
      const whitelisted = await auction.isWhitelisted(signer.address);
      if (!whitelisted) {
        await auction.setWhitelist([signer.address], true);
        console.log(`   ✅ 为 ${signer.address.slice(0,10)}... 添加白名单`);
      }
    }
    console.log("   ✅ 测试账户准备完成");
  }

  console.log("\n✅ 准备就绪，开始模拟出价！\n");
  console.log(`⚙️  配置: 间隔 ${CONFIG.intervalMin}-${CONFIG.intervalMax}ms, 安全缓冲 ${CONFIG.safeBuffer}s`);
  console.log(`👥  ${network.chainId === 31337n ? '多账户模式（本地）' : '单账户模式（Sepolia）'}\n`);

  let txCount = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  while (true) {
    try {
      const isActive = await auction.isRoundActive();
      
      if (!isActive) {
        console.log("⏸️  轮次已结束，等待下一轮开启...");
        await sleep(5000);
        consecutiveErrors = 0; // 重置错误计数
        continue;
      }

      const lastTime = await auction.lastClearingTime();
      const roundDuration = Number(process.env.ROUND_DURATION) || 300;
      
      // 使用缓存的区块时间（减少 RPC 调用）
      const blockTimestamp = await getBlockTime(ethers.provider);
      const elapsed = blockTimestamp - Number(lastTime);
      const timeLeft = roundDuration - elapsed;

      // 安全缓冲：如果时间不足，暂停发单
      if (timeLeft < CONFIG.safeBuffer) {
        process.stdout.write(`\r⚠️  本轮仅剩 ${timeLeft}秒，停止发单，等待结算...   `);
        await sleep(3000);
        continue; 
      }

      // 生成随机订单
      const amount = Math.floor(Math.random() * (CONFIG.maxAmount - CONFIG.minAmount) + CONFIG.minAmount);
      const priceRaw = (Math.random() * (CONFIG.maxPrice - CONFIG.minPrice) + CONFIG.minPrice).toFixed(2);
      const amountWei = ethers.parseEther(amount.toString());
      const priceWei = ethers.parseEther(priceRaw); 

      // 选择出价账户
      let bidder = admin;
      if (signers.length > 1 && network.chainId === 31337n) {
        const randomIndex = Math.floor(Math.random() * Math.min(signers.length, 5));
        bidder = signers[randomIndex];
      }

      process.stdout.write(`⚡ [#${++txCount}] ${bidder.address.slice(0,8)}... | 剩${timeLeft}s | $${priceRaw} x ${amount} ... `);

      // 发送交易（不等待确认，加快速度）
      const tx = await auction.connect(bidder).placeBid(amountWei, priceWei);
      console.log(`📤 已发送 (${tx.hash.slice(0, 10)}...)`);
      
      // 异步等待确认，不阻塞主循环
      tx.wait().then((receipt: any) => {
        console.log(`   ✅ #${txCount} 已确认 (区块 #${receipt?.blockNumber})`);
      }).catch((e: any) => {
        console.log(`   ⚠️ #${txCount} 确认失败: ${e.message.slice(0, 30)}...`);
      });
      
      consecutiveErrors = 0; // 重置错误计数
      
    } catch (e: any) {
      consecutiveErrors++;
      const errMsg = e.message.slice(0, 60);
      console.log(`\n❌ 错误 (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${errMsg}...`);
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log("\n⚠️ 连续错误过多，等待 30 秒后重试...");
        await sleep(30000);
        consecutiveErrors = 0;
      } else {
        await sleep(5000);
      }
    }

    const waitTime = Math.floor(Math.random() * (CONFIG.intervalMax - CONFIG.intervalMin) + CONFIG.intervalMin);
    await sleep(waitTime);
  }
}

main().catch(console.error);
