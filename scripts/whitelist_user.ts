import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // 从环境变量读取合约地址
  const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
  
  if (!AUCTION_ADDRESS) {
    console.error("❌ 请在 .env 中设置 AUCTION_ADDRESS");
    return;
  }
  
  // 默认将部署者添加到白名单（也可以通过命令行参数指定其他地址）
  const targetAddress = process.argv[2] || deployer.address;
  
  console.log(`🛡️ 正在将用户 ${targetAddress} 加入 KYC 白名单...`);
  console.log(`📋 拍卖合约: ${AUCTION_ADDRESS}`);

  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);

  const tx = await auction.setWhitelist([targetAddress], true);
  console.log("⏳ 交易发送中，等待确认...");
  await tx.wait();

  console.log("✅ 白名单添加成功！");
  
  // 验证白名单状态
  const whitelistStatus = await auction.isWhitelisted(targetAddress);
  console.log(`🔍 验证: ${targetAddress} 白名单状态 = ${whitelistStatus}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
