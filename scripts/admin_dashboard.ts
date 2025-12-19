/**
 * 管理员仪表板 - 查看募集资金和提现
 * 运行: npx hardhat run scripts/admin_dashboard.ts --network localhost
 */
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [admin] = await ethers.getSigners();

  // 合约地址
  const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "";
  const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "";
  const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "";

  if (!AUCTION_ADDRESS || !USDC_ADDRESS) {
    console.error("❌ 请在 .env 中配置合约地址");
    return;
  }

  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);
  const usdc = await ethers.getContractAt("MockERC20", USDC_ADDRESS);
  const token = await ethers.getContractAt("MockERC20", TOKEN_ADDRESS);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║           💰 DABANC Launchpad 管理员仪表板                    ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║ 👤 管理员地址: ${admin.address.slice(0, 20)}...      ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // 1. 查看合约状态
  const currentRoundId = await auction.currentRoundId();
  const isRoundActive = await auction.isRoundActive();
  const owner = await auction.owner();
  
  console.log("📊 合约状态概览");
  console.log("─".repeat(50));
  console.log(`   合约拥有者: ${owner}`);
  console.log(`   当前轮次: #${currentRoundId}`);
  console.log(`   轮次状态: ${isRoundActive ? "🟢 进行中" : "🔴 已结束"}`);
  
  // 2. 代币供应统计
  const supplyStats = await auction.getSupplyStats();
  console.log("\n📦 代币供应统计");
  console.log("─".repeat(50));
  console.log(`   总供应量: ${ethers.formatEther(supplyStats[0])} wSPX`);
  console.log(`   已发行量: ${ethers.formatEther(supplyStats[1])} wSPX`);
  console.log(`   剩余供应: ${ethers.formatEther(supplyStats[2])} wSPX`);
  console.log(`   本轮供应: ${ethers.formatEther(supplyStats[3])} wSPX`);
  console.log(`   发行进度: ${Number(supplyStats[4]) / 100}%`);
  
  // 3. 资金统计
  const auctionUSDCBalance = await usdc.balanceOf(AUCTION_ADDRESS);
  const adminUSDCBalance = await usdc.balanceOf(admin.address);
  
  let vaultUSDCBalance = BigInt(0);
  if (VAULT_ADDRESS) {
    vaultUSDCBalance = await usdc.balanceOf(VAULT_ADDRESS);
  }

  console.log("\n💵 资金统计 (USDC)");
  console.log("─".repeat(50));
  console.log(`   🏦 拍卖合约余额 (可提取): ${ethers.formatUnits(auctionUSDCBalance, 18)} USDC`);
  console.log(`   🔒 绿鞋金库余额: ${ethers.formatUnits(vaultUSDCBalance, 18)} USDC`);
  console.log(`   👤 管理员钱包余额: ${ethers.formatUnits(adminUSDCBalance, 18)} USDC`);
  
  // 4. 各轮次统计
  console.log("\n📈 历史轮次统计");
  console.log("─".repeat(70));
  console.log("轮次\t| 清算价\t\t| 发行代币\t| 总出价\t\t| 状态");
  console.log("─".repeat(70));
  
  let totalRaised = BigInt(0);
  for (let i = 1; i <= Number(currentRoundId); i++) {
    // RoundInfo: totalBidAmount, clearingPrice, totalTokensSold, isCleared
    const roundInfo = await auction.rounds(i);
    const totalBidAmount = roundInfo[0];
    const price = roundInfo[1];
    const tokensIssued = roundInfo[2];
    const cleared = roundInfo[3];
    
    const priceFormatted = ethers.formatUnits(price, 18);
    const tokensFormatted = ethers.formatEther(tokensIssued);
    const bidFormatted = ethers.formatUnits(totalBidAmount, 18);
    
    totalRaised += totalBidAmount;
    
    console.log(
      `#${i}\t| $${parseFloat(priceFormatted).toFixed(2)}\t\t| ${parseFloat(tokensFormatted).toFixed(1)} wSPX\t| $${parseFloat(bidFormatted).toFixed(2)}\t\t| ${cleared ? "✅ 已清算" : "⏳ 未清算"}`
    );
  }
  
  console.log("─".repeat(70));
  console.log(`💰 历史总出价金额: $${ethers.formatUnits(totalRaised, 18)} USDC`);
  
  // 5. 提款操作选项
  console.log("\n═════════════════════════════════════════════════════════════");
  console.log("📤 可用操作:");
  console.log("─".repeat(50));
  
  if (admin.address.toLowerCase() === owner.toLowerCase()) {
    console.log("✅ 您是合约拥有者，可以执行以下操作:\n");
    
    if (auctionUSDCBalance > 0) {
      console.log(`   1. 提取募集资金: ${ethers.formatUnits(auctionUSDCBalance, 18)} USDC`);
      console.log(`      命令: npx hardhat run scripts/withdraw_proceeds.ts --network localhost\n`);
    } else {
      console.log("   ℹ️  当前无可提取资金\n");
    }
    
    console.log("   2. 暂停合约 (紧急情况)");
    console.log("      命令: npx hardhat run scripts/pause_auction.ts --network localhost\n");
  } else {
    console.log("⚠️  您不是合约拥有者，无法执行管理操作");
  }
}

main().catch(console.error);

