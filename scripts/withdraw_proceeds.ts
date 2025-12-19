/**
 * 提取募集资金
 * 运行: npx hardhat run scripts/withdraw_proceeds.ts --network localhost
 */
import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [admin] = await ethers.getSigners();

  const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "";

  if (!AUCTION_ADDRESS || !USDC_ADDRESS) {
    console.error("❌ 请在 .env 中配置合约地址");
    return;
  }

  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);
  const usdc = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

  // 检查权限
  const owner = await auction.owner();
  if (admin.address.toLowerCase() !== owner.toLowerCase()) {
    console.error("❌ 只有合约拥有者可以提款");
    return;
  }

  // 查询可提取金额
  const balance = await usdc.balanceOf(AUCTION_ADDRESS);
  
  if (balance === BigInt(0)) {
    console.log("ℹ️  当前没有可提取的资金");
    return;
  }

  console.log("\n💰 准备提取募集资金");
  console.log("─".repeat(40));
  console.log(`   可提取金额: ${ethers.formatUnits(balance, 18)} USDC`);
  console.log(`   接收地址: ${admin.address}`);
  
  // 执行提款
  console.log("\n🔄 正在执行提款交易...");
  const tx = await auction.withdrawProceeds();
  console.log(`   交易哈希: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`   区块确认: #${receipt?.blockNumber}`);
  
  // 验证余额
  const newBalance = await usdc.balanceOf(admin.address);
  console.log(`\n✅ 提款成功！`);
  console.log(`   管理员当前 USDC 余额: ${ethers.formatUnits(newBalance, 18)} USDC`);
}

main().catch(console.error);

