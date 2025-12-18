import { ethers } from "hardhat";

// ⚠️ 确保填入新部署的地址
const AUCTION_ADDRESS = "0xc9AeBb8D366113383BB243bD9299b3392C30421c"; // ✅ 新 Auction
const USDC_ADDRESS = "0x412E1Aa8223e17eC4b64F63C26D5B7E032B67Fbf";    // ✅ 新 USDC

const CONFIG = {
  minPrice: 1,         // $1
  maxPrice: 20,        // $20
  minAmount: 100,      // 100 U
  maxAmount: 1000,     // 1000 U
  intervalMin: 2000,   // 2秒一单 (Sepolia出块较慢，太快容易堵塞)
  intervalMax: 5000 
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`🤖 启动 Sepolia 流量生成器 (单账户模式)...`);
  
  // 只获取第一个账户 (您的管理员账户)
  const [admin] = await ethers.getSigners();
  console.log(`👤 交易员: ${admin.address}`);

  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = Auction.attach(AUCTION_ADDRESS);
  const USDC = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

  // 1. 检查余额和授权
  // @ts-ignore
  const balance = await USDC.balanceOf(admin.address);
  console.log(`💰 当前 USDC 余额: ${ethers.formatEther(balance)}`);
  
  // 确保有足够的 USDC (如果没有就 Mint 10万)
  if (balance < ethers.parseEther("10000")) {
      console.log("🚰 余额不足，正在领水...");
      // @ts-ignore
      const tx = await USDC.mint(admin.address, ethers.parseEther("100000"));
      await tx.wait();
  }

  // 确保已授权
  // @ts-ignore
  const allowance = await USDC.allowance(admin.address, AUCTION_ADDRESS);
  if (allowance < ethers.parseEther("1000000")) {
      console.log("🔓 正在授权合约...");
      // @ts-ignore
      const tx = await USDC.approve(AUCTION_ADDRESS, ethers.MaxUint256);
      await tx.wait();
  }

  console.log("✅ 准备就绪，开始刷单！(按 Ctrl+C 停止)\n");

  // 2. 循环刷单
  let txCount = 0;
  while (true) {
    try {
      // 随机生成参数
      const amount = Math.floor(Math.random() * (CONFIG.maxAmount - CONFIG.minAmount) + CONFIG.minAmount);
      const priceRaw = (Math.random() * (CONFIG.maxPrice - CONFIG.minPrice) + CONFIG.minPrice).toFixed(1);
      
      const amountWei = ethers.parseEther(amount.toString());
      const priceWei = ethers.parseEther(priceRaw); 

      // 打印日志
      process.stdout.write(`⚡ [订单 #${++txCount}] 限价 $${priceRaw} | 投入 ${amount} U ... `);

      // 发送交易
      // @ts-ignore
      const tx = await auction.placeBid(amountWei, priceWei);
      // Sepolia 上不等待确认以提高发送速度，只要 Nonce 没问题就能排队
      // await tx.wait(); 
      console.log(`✅ 已发送 (Hash: ${tx.hash.slice(0,10)}...)`);
      
    } catch (e: any) {
      if (e.message.includes("Round is NOT active")) {
        console.log("\n⏸️  轮次已结束，脚本休眠中...");
        await sleep(10000); 
      } else {
        console.log(`\n❌ 交易失败: ${e.message.slice(0, 50)}...`);
      }
    }

    // 随机等待
    const waitTime = Math.floor(Math.random() * (CONFIG.intervalMax - CONFIG.intervalMin) + CONFIG.intervalMin);
    await sleep(waitTime);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});