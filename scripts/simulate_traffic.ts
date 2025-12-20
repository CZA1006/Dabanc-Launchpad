import { ethers } from "hardhat";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
const USDC_ADDRESS = process.env.USDC_ADDRESS || "";
const API_URL = "http://localhost:3001/api/bid";

const CONFIG = {
  minPrice: 1, maxPrice: 20,
  minAmount: 100, maxAmount: 2000,
  intervalMin: 500, intervalMax: 1500, 
  safeBuffer: 20, 
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!AUCTION_ADDRESS || !USDC_ADDRESS) {
    console.error("❌ 请检查 .env 配置");
    process.exit(1);
  }

  const [admin] = await ethers.getSigners();
  console.log(`🤖 启动 API 流量模拟器 | 账户: ${admin.address}`);
  
  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);
  const usdc = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

  // 1. 资金准备 (链上)
  console.log("💰 检查资金...");
  const usdcBalance = await usdc.balanceOf(admin.address);
  if (usdcBalance < ethers.parseEther("1000")) {
    console.log("   💸 Minting USDC...");
    await (await usdc.mint(admin.address, ethers.parseEther("100000"))).wait();
  }

  const allowance = await usdc.allowance(admin.address, AUCTION_ADDRESS);
  if (allowance < ethers.parseEther("1000000")) {
    console.log("   🔓 Approving...");
    await (await usdc.approve(AUCTION_ADDRESS, ethers.MaxUint256)).wait();
  }

  // @ts-ignore
  const deposited = await auction.userBalances(admin.address);
  console.log(`   🏦 平台余额: ${ethers.formatEther(deposited)} USDC`);

  if (deposited < ethers.parseEther("50000")) {
    console.log("   📥 充值中...");
    // @ts-ignore
    await (await auction.deposit(ethers.parseEther("100000"))).wait();
    console.log("   ✅ 充值完成");
  }

  console.log("\n🚀 开始刷单...");

  let txCount = 0;
  while (true) {
    try {
      // @ts-ignore
      const isActive = await auction.isRoundActive();
      if (!isActive) {
        console.log("⏸️  休息中...");
        await sleep(3000);
        continue;
      }

      // @ts-ignore
      const currentRoundId = Number(await auction.currentRoundId());
      // @ts-ignore
      const lastTime = Number(await auction.lastClearingTime());
      const now = Math.floor(Date.now() / 1000);
      const timeLeft = 300 - (now - lastTime);

      if (timeLeft < CONFIG.safeBuffer) {
        process.stdout.write(`\r⚠️  剩余 ${timeLeft}s，停止发单...   `);
        await sleep(2000);
        continue;
      }

      const amount = Math.floor(Math.random() * (CONFIG.maxAmount - CONFIG.minAmount) + CONFIG.minAmount);
      const price = (Math.random() * (CONFIG.maxPrice - CONFIG.minPrice) + CONFIG.minPrice).toFixed(2);

      process.stdout.write(`⚡ [#${++txCount}] Round #${currentRoundId} | $${price} x ${amount} U ... `);

      // 发送 API 请求
      await axios.post(API_URL, {
        roundId: currentRoundId,
        userAddress: admin.address,
        amount: amount, 
        limitPrice: price
      });

      console.log(`✅ Sent`);

    } catch (e: any) {
      console.log(`❌ Error: ${e.message}`);
      if (e.code === 'ECONNREFUSED') console.log("🚨 请先启动 server.ts!");
    }
    const waitTime = Math.floor(Math.random() * (CONFIG.intervalMax - CONFIG.intervalMin) + CONFIG.intervalMin);
    await sleep(waitTime);
  }
}

main().catch(console.error);