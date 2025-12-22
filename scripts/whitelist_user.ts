import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
  
  if (!AUCTION_ADDRESS) {
    console.error("❌ 请在 .env 中设置 AUCTION_ADDRESS");
    return;
  }

  // --- 1. 修改：定义需要添加的白名单地址列表 ---
  const targetAddresses = [
    deployer.address
    // 你可以根据需要在此添加更多地址
  ];

  // 如果你也想支持通过命令行传参，可以使用 slice(2) 获取所有后续参数
  // 如果命令行没传参，则使用上面定义的默认列表
  const finalAddresses = process.argv.length > 2 
    ? process.argv.slice(2) 
    : targetAddresses;
  
  if (finalAddresses.length === 0) {
    console.error("❌ 未提供任何地址进行白名单处理");
    return;
  }

  console.log(`🛡️ 正在将 ${finalAddresses.length} 个用户加入 KYC 白名单...`);
  console.log(`📋 拍卖合约: ${AUCTION_ADDRESS}`);

  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);

  // --- 2. 修改：将整个数组传入合约方法 ---
  const tx = await auction.setWhitelist(finalAddresses, true);
  console.log("⏳ 交易发送中，Hash:", tx.hash);
  await tx.wait();

  console.log("✅ 白名单批量添加成功！");
  
  // --- 3. 修改：循环验证所有地址的状态 ---
  console.log("🔍 状态验证:");
  for (const addr of finalAddresses) {
    const isWhitelisted = await auction.isWhitelisted(addr);
    console.log(`  - ${addr}: ${isWhitelisted ? "已添加 ✅" : "添加失败 ❌"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});