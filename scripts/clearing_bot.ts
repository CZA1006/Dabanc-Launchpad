import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

// 填入 Sepolia 部署的地址
const AUCTION_ADDRESS = "0xc253d2901dd2B5e77e6A76cBA10E1aa5e423bfc4"; // 您的拍卖合约
const DB_PATH = path.join(__dirname, "../backend_db/history.json");

async function main() {
  const [admin] = await ethers.getSigners();
  console.log(`🤖 清算机器人启动 (Admin: ${admin.address})`);

  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = Auction.attach(AUCTION_ADDRESS);

  // 1. 获取当前状态
  // @ts-ignore
  const roundId = await auction.currentRoundId();
  // @ts-ignore
  const roundData = await auction.rounds(roundId);
  // @ts-ignore
  const lastTime = await auction.lastClearingTime();
  
  const totalBid = roundData[0]; // totalBidAmount
  const isCleared = roundData[2]; // isCleared

  console.log(`\n📊 当前轮次: #${roundId}`);
  console.log(`💰 当前募资: ${ethers.formatEther(totalBid)} USDC`);
  
  // 2. 检查时间 (5分钟 = 300秒)
  const now = Math.floor(Date.now() / 1000);
  const timePassed = now - Number(lastTime);
  const timeLeft = 300 - timePassed;

  if (timePassed < 300) {
    console.log(`⏳ 时间未到，还剩 ${timeLeft} 秒... 机器人休眠。`);
    return;
  }

  console.log("✅ 时间已到！开始执行清算流程...");

  // 3. 模拟定价算法 (Backend Pricing Engine)
  // 假设策略：本轮我们想卖出 500 枚 wSPX
  // 价格 = 总募资额 / 500
  // 如果没人出价，设个地板价 1.0
  let clearingPrice;
  const tokenSupplyForRound = ethers.parseEther("500"); 

  if (totalBid > 0n) {
    // 价格 = (总资金 * 1e18) / 发行量 (注意精度处理)
    // 这里简化计算： Price = TotalBid / 500
    clearingPrice = (totalBid * BigInt(1e18)) / tokenSupplyForRound;
  } else {
    clearingPrice = ethers.parseEther("1.0"); // 默认地板价
  }

  console.log(`🧮 后端计算清算价格: ${ethers.formatEther(clearingPrice)} USDC/Token`);

  // 4. 执行链上结算
  console.log("🔗 正在发送上链交易...");
  // @ts-ignore
  const tx = await auction.executeClearing(clearingPrice);
  console.log(`➡️ 交易发送成功: ${tx.hash}`);
  await tx.wait();
  console.log("✅ 链上结算确认完毕！");

  // 5. 写入后端数据库 (模拟)
  const newRecord = {
    roundId: Number(roundId),
    totalRaised: ethers.formatEther(totalBid),
    clearingPrice: ethers.formatEther(clearingPrice),
    timestamp: new Date().toISOString(),
    status: "Success"
  };

  // 读取旧数据并追加
  let dbData = [];
  try {
    const fileContent = fs.readFileSync(DB_PATH, "utf-8");
    dbData = JSON.parse(fileContent);
  } catch (e) {}
  
  dbData.push(newRecord);
  fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));
  
  console.log("💾 数据已保存到 backend_db/history.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});