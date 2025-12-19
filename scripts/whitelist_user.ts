import { ethers } from "hardhat";

// Anvil 本地部署的拍卖合约地址
const AUCTION_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  // Anvil 默认账户 #0 (部署者账户，也是测试用户)
  const targetAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; 
  
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