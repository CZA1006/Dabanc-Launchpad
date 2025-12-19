/**
 * 诊断脚本 - 检查合约状态和权限
 */
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("🔍 DABANC 合约诊断工具");
  console.log("═".repeat(60));

  const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
  const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "";
  
  if (!AUCTION_ADDRESS) {
    console.error("❌ 请在 .env 中配置 AUCTION_ADDRESS");
    return;
  }

  const [signer] = await ethers.getSigners();
  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);
  
  console.log("\n📋 基本信息:");
  console.log("─".repeat(60));
  console.log(`   当前签名者: ${signer.address}`);
  
  // 检查 owner
  const owner = await auction.owner();
  console.log(`   合约 Owner: ${owner}`);
  
  const isOwner = signer.address.toLowerCase() === owner.toLowerCase();
  console.log(`   是否为 Owner: ${isOwner ? "✅ 是" : "❌ 否"}`);
  
  if (!isOwner) {
    console.log("\n⚠️  警告: 当前账户不是合约 Owner，无法执行管理操作！");
    console.log(`   需要使用部署时的账户: ${owner}`);
  }

  // 检查轮次状态
  console.log("\n📊 轮次状态:");
  console.log("─".repeat(60));
  
  const currentRoundId = await auction.currentRoundId();
  const isRoundActive = await auction.isRoundActive();
  const lastClearingTime = await auction.lastClearingTime();
  
  console.log(`   当前轮次: #${currentRoundId}`);
  console.log(`   轮次活跃: ${isRoundActive ? "🟢 是" : "🔴 否"}`);
  console.log(`   上次清算时间: ${new Date(Number(lastClearingTime) * 1000).toLocaleString()}`);
  
  // 检查代币供应
  console.log("\n📦 代币供应:");
  console.log("─".repeat(60));
  
  const supplyStats = await auction.getSupplyStats();
  console.log(`   总供应量: ${ethers.formatEther(supplyStats[0])} wSPX`);
  console.log(`   已发行量: ${ethers.formatEther(supplyStats[1])} wSPX`);
  console.log(`   剩余供应: ${ethers.formatEther(supplyStats[2])} wSPX`);
  console.log(`   本轮供应: ${ethers.formatEther(supplyStats[3])} wSPX`);
  
  const allIssued = supplyStats[1] >= supplyStats[0];
  if (allIssued) {
    console.log("\n⚠️  警告: 所有代币已发行完毕，无法开启新轮次！");
  }

  // 检查拍卖合约的代币余额
  if (TOKEN_ADDRESS) {
    const token = await ethers.getContractAt("MockERC20", TOKEN_ADDRESS);
    const auctionBalance = await token.balanceOf(AUCTION_ADDRESS);
    console.log(`   合约代币余额: ${ethers.formatEther(auctionBalance)} wSPX`);
    
    if (auctionBalance < supplyStats[3]) {
      console.log("\n⚠️  警告: 合约代币余额不足以支撑本轮供应！");
    }
  }

  // 检查当前轮次详情
  if (Number(currentRoundId) > 0) {
    console.log("\n📈 当前轮次详情:");
    console.log("─".repeat(60));
    
    const roundInfo = await auction.rounds(currentRoundId);
    console.log(`   总出价金额: ${ethers.formatEther(roundInfo[0])} USDC`);
    console.log(`   清算价格: ${ethers.formatEther(roundInfo[1])} USDC`);
    console.log(`   已售代币: ${ethers.formatEther(roundInfo[2])} wSPX`);
    console.log(`   是否已清算: ${roundInfo[3] ? "✅ 是" : "❌ 否"}`);
  }

  // 诊断建议
  console.log("\n💡 诊断建议:");
  console.log("─".repeat(60));
  
  if (!isOwner) {
    console.log("   1. 使用正确的 PRIVATE_KEY（部署时的账户）");
    console.log(`      Owner 地址: ${owner}`);
  }
  
  if (isRoundActive) {
    console.log("   2. 当前轮次仍在进行中，需要等待结束或执行清算");
  }
  
  if (allIssued) {
    console.log("   3. 所有代币已发行完毕，拍卖结束");
  }
  
  if (isOwner && !isRoundActive && !allIssued) {
    console.log("   ✅ 状态正常，可以调用 startNextRound()");
  }
}

main().catch(console.error);

