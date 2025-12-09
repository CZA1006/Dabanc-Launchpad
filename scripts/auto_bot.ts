import { ethers } from "hardhat";

// ✅ 确保这里填的是您刚部署成功的最新合约地址
const AUCTION_ADDRESS = "0xc0653Cdd77f0351cD50BCa6318535ec816E422FA"; 

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🤖 半自动清算机器人已启动 (只负责结算)");
  const [admin] = await ethers.getSigners();
  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = Auction.attach(AUCTION_ADDRESS);

  while (true) {
    try {
      // @ts-ignore
      const isActive = await auction.isRoundActive();
      // @ts-ignore
      const lastTime = await auction.lastClearingTime();
      // @ts-ignore
      const currentRoundId = await auction.currentRoundId();
      // @ts-ignore
      const roundData = await auction.rounds(currentRoundId);
      const totalBid = roundData[0];

      // 情况 A: 竞价进行中 -> 检查时间并结算
      if (isActive) {
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = 300 - (now - Number(lastTime));

        process.stdout.write(`\r[Round #${currentRoundId} 进行中] 募资: ${ethers.formatEther(totalBid)} U | 倒计时: ${timeLeft}s   `);

        if (timeLeft <= 0) {
          console.log("\n\n⚡️ 时间到！触发自动清算...");
          
          let clearingPrice;
          if (totalBid > 0n) {
             // 500枚发行量
            clearingPrice = (totalBid * BigInt(1e18)) / BigInt(500 * 1e18);
          } else {
            clearingPrice = ethers.parseEther("1.0");
          }

          // @ts-ignore
          const tx = await auction.connect(admin).executeClearing(clearingPrice);
          console.log(`🔗 结算交易已发送: ${tx.hash}`);
          await tx.wait();
          console.log(`✅ Round #${currentRoundId} 已结算。等待管理员手动开启下一轮。\n`);
        }
      } 
      // 情况 B: 已结算 -> 等待管理员前端操作
      else {
        process.stdout.write(`\r[Round #${currentRoundId} 已结束] 等待管理员在前端开启下一轮...   `);
      }

    } catch (error) {
      console.error("\n❌ 网络/RPC 错误:", error.message);
    }

    await sleep(3000); // 每3秒检查一次
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});