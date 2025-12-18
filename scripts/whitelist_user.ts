import { ethers } from "hardhat";

// 确保这里的合约地址是您之前部署的那个
// ⚠️ 必须是 Step 3 部署的那个新地址
const AUCTION_ADDRESS = "0xc9AeBb8D366113383BB243bD9299b3392C30421c"; // ✅ 新 Auction

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // ⚠️⚠️⚠️ 请把这里换成您网页上显示的那个钱包地址 ⚠️⚠️⚠️
  const targetAddress = "0x3c3c15373ecf0f68c7a841eac56893ffe1952a94"; 
  
  console.log(`🛡️ 正在将用户 ${targetAddress} 加入 KYC 白名单...`);

  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = Auction.attach(AUCTION_ADDRESS);

  // @ts-ignore
  const tx = await auction.setWhitelist([targetAddress], true);
  console.log("⏳ 交易发送中，等待确认...");
  await tx.wait();

  console.log("✅ 白名单添加成功！");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});