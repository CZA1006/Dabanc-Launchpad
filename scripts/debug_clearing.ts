/**
 * 调试清算问题
 */
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
  
  if (!AUCTION_ADDRESS) {
    console.error("❌ 请配置 AUCTION_ADDRESS");
    return;
  }

  console.log("🔍 调试清算问题\n");
  
  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);
  
  // 获取合约参数
  const currentRoundId = await auction.currentRoundId();
  const isRoundActive = await auction.isRoundActive();
  const lastClearingTime = await auction.lastClearingTime();
  const ROUND_DURATION = await auction.ROUND_DURATION();
  const minClearingPrice = await auction.minClearingPrice();
  const maxClearingPrice = await auction.maxClearingPrice();
  
  // 获取当前区块时间
  const latestBlock = await ethers.provider.getBlock('latest');
  const blockTimestamp = latestBlock?.timestamp || 0;
  
  console.log("═".repeat(60));
  console.log("📋 合约参数:");
  console.log("─".repeat(60));
  console.log(`   当前轮次: #${currentRoundId}`);
  console.log(`   轮次活跃: ${isRoundActive}`);
  console.log(`   上次清算时间: ${lastClearingTime} (${new Date(Number(lastClearingTime) * 1000).toLocaleString()})`);
  console.log(`   轮次时长: ${ROUND_DURATION} 秒`);
  console.log(`   最小清算价: ${ethers.formatEther(minClearingPrice)} USDC`);
  console.log(`   最大清算价: ${ethers.formatEther(maxClearingPrice)} USDC`);
  
  console.log("\n═".repeat(60));
  console.log("⏰ 时间检查:");
  console.log("─".repeat(60));
  console.log(`   当前区块时间: ${blockTimestamp} (${new Date(blockTimestamp * 1000).toLocaleString()})`);
  console.log(`   本地时间: ${Math.floor(Date.now() / 1000)} (${new Date().toLocaleString()})`);
  
  const roundEndTime = Number(lastClearingTime) + Number(ROUND_DURATION);
  const timeRemaining = roundEndTime - blockTimestamp;
  
  console.log(`   轮次结束时间: ${roundEndTime} (${new Date(roundEndTime * 1000).toLocaleString()})`);
  console.log(`   剩余时间（链上）: ${timeRemaining} 秒`);
  
  if (timeRemaining > 0) {
    console.log(`\n⚠️  警告: 链上时间显示轮次还有 ${timeRemaining} 秒才结束！`);
    console.log("   这可能是 Bot 时间判断与链上时间不同步导致的。");
    console.log("   Bot 使用本地时间，但合约使用区块时间。");
  } else {
    console.log(`\n✅ 时间检查通过: 轮次已经可以清算`);
  }

  // 检查轮次信息
  const roundInfo = await auction.rounds(currentRoundId);
  console.log("\n═".repeat(60));
  console.log(`📈 Round #${currentRoundId} 详情:`);
  console.log("─".repeat(60));
  console.log(`   总出价金额: ${ethers.formatEther(roundInfo[0])} USDC`);
  console.log(`   清算价格: ${ethers.formatEther(roundInfo[1])} USDC`);
  console.log(`   已售代币: ${ethers.formatEther(roundInfo[2])} wSPX`);
  console.log(`   是否清算: ${roundInfo[3]}`);

  // 检查代币供应
  console.log("\n═".repeat(60));
  console.log("📦 代币供应检查:");
  console.log("─".repeat(60));
  const supplyStats = await auction.getSupplyStats();
  console.log(`   总供应量: ${ethers.formatEther(supplyStats[0])} wSPX`);
  console.log(`   已发行量: ${ethers.formatEther(supplyStats[1])} wSPX`);
  console.log(`   剩余供应: ${ethers.formatEther(supplyStats[2])} wSPX`);
  console.log(`   本轮供应: ${ethers.formatEther(supplyStats[3])} wSPX`);
  
  // 检查合约代币余额
  const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "";
  if (TOKEN_ADDRESS) {
    const token = await ethers.getContractAt("MockERC20", TOKEN_ADDRESS);
    const contractBalance = await token.balanceOf(AUCTION_ADDRESS);
    console.log(`   合约代币余额: ${ethers.formatEther(contractBalance)} wSPX`);
    
    if (contractBalance < supplyStats[3]) {
      console.log("\n⚠️  警告: 合约代币余额不足以支撑本轮供应！");
    }
  }

  // 给出建议
  console.log("\n═".repeat(60));
  console.log("💡 可能的清算失败原因:");
  console.log("─".repeat(60));
  
  if (timeRemaining > 0) {
    console.log("1. ⏰ 时间未到: 链上区块时间还没到轮次结束时间");
    console.log("   解决方案: 等待或增加 Bot 的时间缓冲");
  }
  
  console.log("2. 📊 清算价超出范围:");
  console.log(`   允许范围: $${ethers.formatEther(minClearingPrice)} - $${ethers.formatEther(maxClearingPrice)}`);
  
  if (!isRoundActive) {
    console.log("3. 🔴 轮次已不活跃: 可能已被清算");
  }
  
  console.log("\n═".repeat(60));
}

main().catch(console.error);

