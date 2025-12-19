import { ethers } from "hardhat";

// Anvil 本地部署地址
const AUCTION_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"; 
const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const CONFIG = {
  minPrice: 1, maxPrice: 20,
  minAmount: 100, maxAmount: 2000,
  intervalMin: 2000, intervalMax: 5000
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`🤖 启动 Sepolia 流量生成器 (智能防撞墙版)...`);
  
  const [admin] = await ethers.getSigners();
  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = Auction.attach(AUCTION_ADDRESS);
  const USDC = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

  // 1. 资金检查 (略，假设已充足)
  // ...

  console.log("\n✅ 准备就绪，开始刷单！\n");

  let txCount = 0;
  while (true) {
    try {
      // 🌟 核心升级：每次下单前先检查时间！
      // @ts-ignore
      const isActive = await auction.isRoundActive();
      // @ts-ignore
      const lastTime = await auction.lastClearingTime();
      
      if (!isActive) {
          console.log("⏸️  轮次已结束，等待下一轮开启...");
          await sleep(5000);
          continue;
      }

      // 计算剩余时间
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - Number(lastTime);
      const timeLeft = 300 - elapsed; // 5分钟

      // 🛑 安全缓冲：如果只剩 20秒，就别发了，因为上链需要时间
      if (timeLeft < 20) {
          process.stdout.write(`\r⚠️  本轮仅剩 ${timeLeft}秒，停止发单，等待结算...   `);
          await sleep(3000);
          continue; 
      }

      // 正常下单逻辑
      const amount = Math.floor(Math.random() * (CONFIG.maxAmount - CONFIG.minAmount) + CONFIG.minAmount);
      const priceRaw = (Math.random() * (CONFIG.maxPrice - CONFIG.minPrice) + CONFIG.minPrice).toFixed(1);
      const amountWei = ethers.parseEther(amount.toString());
      const priceWei = ethers.parseEther(priceRaw); 

      process.stdout.write(`⚡ [订单 #${++txCount}] 剩余${timeLeft}s | 限价 $${priceRaw} ... `);

      // @ts-ignore
      const tx = await auction.placeBid(amountWei, priceWei);
      console.log(`✅ 已广播`);
      
    } catch (e: any) {
      console.log(`\n❌ 错误: ${e.message.slice(0, 40)}...`);
      await sleep(3000);
    }

    const waitTime = Math.floor(Math.random() * (CONFIG.intervalMax - CONFIG.intervalMin) + CONFIG.intervalMin);
    await sleep(waitTime);
  }
}

main().catch(console.error);