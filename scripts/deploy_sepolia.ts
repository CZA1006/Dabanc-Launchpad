import { ethers } from "hardhat";

async function main() {
  console.log("🚀 正在连接 Sepolia 测试网...");
  
  const [deployer] = await ethers.getSigners();
  console.log(`👨‍✈️ 部署账户: ${deployer.address}`);
  console.log(`💰 账户余额: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH`);

  // 1. 部署 USDC (模拟)
  console.log("\nStep 1: 部署 Mock USDC...");
  const MockToken = await ethers.getContractFactory("MockERC20");
  const usdc = await MockToken.deploy("Test USDC", "USDC");
  await usdc.waitForDeployment();
  console.log(`✅ USDC 合约: ${await usdc.getAddress()}`);

  // 2. 部署 SpaceX 代币 (模拟 RWA)
  console.log("\nStep 2: 部署 SpaceX Token...");
  const spaceX = await MockToken.deploy("SpaceX Equity", "wSPX");
  await spaceX.waitForDeployment();
  console.log(`✅ wSPX 合约: ${await spaceX.getAddress()}`);

  // 3. 部署拍卖合约 (添加总供应量参数)
  console.log("\nStep 3: 部署 Auction 核心合约...");
  const TOTAL_SUPPLY = ethers.parseEther("10000000"); // 1000万 wSPX 总供应量
  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = await Auction.deploy(
    await spaceX.getAddress(), 
    await usdc.getAddress(),
    TOTAL_SUPPLY
  );
  await auction.waitForDeployment();
  console.log(`✅ Auction 合约: ${await auction.getAddress()}`);
  console.log(`   总供应量: ${ethers.formatEther(TOTAL_SUPPLY)} wSPX`);

  // 4. 部署绿鞋金库
  console.log("\nStep 4: 部署绿鞋金库...");
  const GreenShoe = await ethers.getContractFactory("GreenShoeVault");
  const vault = await GreenShoe.deploy(await usdc.getAddress());
  await vault.waitForDeployment();
  
  // 绑定
  await auction.setGreenShoeVault(await vault.getAddress());
  await vault.setAuctionContract(await auction.getAddress());
  console.log(`✅ Vault 合约: ${await vault.getAddress()} (已绑定)`);

  console.log("\n🎉 部署完成！请保存以上地址用于前端开发。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});