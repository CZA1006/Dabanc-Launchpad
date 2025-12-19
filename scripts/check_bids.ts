/**
 * 检查当前轮次的所有出价 - 使用合约存储而非事件
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

  console.log("🔍 检查链上出价数据\n");
  
  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);
  const currentRoundId = await auction.currentRoundId();
  const isActive = await auction.isRoundActive();
  
  console.log(`📊 当前轮次: #${currentRoundId}`);
  console.log(`🔄 轮次状态: ${isActive ? '🟢 进行中' : '🔴 已结束'}`);
  console.log(`📋 合约地址: ${AUCTION_ADDRESS}\n`);

  // 获取轮次信息
  const roundInfo = await auction.rounds(currentRoundId);
  console.log("═".repeat(60));
  console.log(`📈 Round #${currentRoundId} 详情:`);
  console.log("─".repeat(60));
  console.log(`   总出价金额: ${ethers.formatEther(roundInfo[0])} USDC`);
  console.log(`   清算价格: ${ethers.formatEther(roundInfo[1])} USDC`);
  console.log(`   已售代币: ${ethers.formatEther(roundInfo[2])} wSPX`);
  console.log(`   是否清算: ${roundInfo[3] ? '是' : '否'}`);
  
  // 检查参与者数量
  try {
    const participantCount = await auction.getRoundParticipantCount(currentRoundId);
    console.log(`   参与者数量: ${participantCount}`);
  } catch (e) {
    console.log(`   参与者数量: 无法获取`);
  }
  
  console.log("═".repeat(60));
  
  // 检查 SQLite 数据库中的订单
  console.log("\n📂 检查本地数据库...");
  
  const path = await import("path");
  const Database = (await import("better-sqlite3")).default;
  const dbPath = path.resolve(__dirname, "..", "backend_db", "orders.db");
  
  try {
    const db = new Database(dbPath);
    
    const bids = db.prepare(`
      SELECT * FROM bids 
      WHERE roundId = ? 
      ORDER BY CAST(limitPrice AS REAL) DESC
    `).all(Number(currentRoundId)) as any[];
    
    console.log(`\n📋 数据库中 Round #${currentRoundId} 的订单: ${bids.length} 笔\n`);
    
    if (bids.length > 0) {
      console.log("用户地址\t\t\t| 限价\t\t| 金额\t\t| 状态");
      console.log("─".repeat(70));
      
      const uniqueUsers = new Set<string>();
      
      for (const bid of bids.slice(0, 20)) { // 只显示前 20 个
        uniqueUsers.add(bid.userAddress);
        console.log(
          `${bid.userAddress.slice(0, 10)}...\t\t| $${parseFloat(bid.limitPrice).toFixed(2)}\t\t| ${parseFloat(bid.amountUSDC).toFixed(0)} USDC\t| ${bid.status}`
        );
      }
      
      if (bids.length > 20) {
        console.log(`... 还有 ${bids.length - 20} 条记录`);
      }
      
      console.log("─".repeat(70));
      console.log(`📊 统计: ${bids.length} 笔出价，来自 ${uniqueUsers.size} 个不同用户`);
      
      if (uniqueUsers.size === 1) {
        console.log("\n⚠️  所有出价都来自同一个用户！");
        console.log("   这是因为 simulate_traffic.ts 在 Sepolia 上只能用一个账户");
      }
    } else {
      console.log("⚠️  数据库中没有当前轮次的订单");
    }
    
    db.close();
  } catch (e: any) {
    console.log(`❌ 无法读取数据库: ${e.message}`);
  }
  
  // 给出建议
  console.log("\n" + "═".repeat(60));
  console.log("💡 说明:");
  console.log("─".repeat(60));
  console.log("• 前端从链上事件读取订单（需要较大区块范围）");
  console.log("• Bot 从本地 SQLite 数据库读取订单");
  console.log("• Sepolia 上 simulate_traffic 只能用部署者账户");
  console.log("• 所以模拟订单和你的订单来自同一地址");
  console.log("═".repeat(60));
}

main().catch(console.error);
