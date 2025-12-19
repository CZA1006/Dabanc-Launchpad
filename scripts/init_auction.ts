import { ethers } from "hardhat";

// Anvil 本地部署地址
const AUCTION_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const WSPX_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

async function main() {
  console.log("🎬 初始化拍卖环境...\n");
  
  const [deployer] = await ethers.getSigners();
  console.log(`👨‍✈️ 操作账户: ${deployer.address}`);

  // 连接合约
  const usdc = await ethers.getContractAt("MockERC20", USDC_ADDRESS);
  const wspx = await ethers.getContractAt("MockERC20", WSPX_ADDRESS);
  const auction = await ethers.getContractAt("BatchAuction", AUCTION_ADDRESS);

  // Step 1: 给部署者 mint 大量 USDC (用于模拟出价)
  console.log("\n📋 Step 1: 铸造 USDC...");
  const usdcAmount = ethers.parseEther("1000000"); // 100万 USDC
  // @ts-ignore
  await usdc.mint(deployer.address, usdcAmount);
  console.log(`✅ 已给 ${deployer.address} 铸造 1,000,000 USDC`);

  // Step 2: 给拍卖合约 mint wSPX 代币 (用于分配给中标者)
  console.log("\n📋 Step 2: 为拍卖合约铸造 wSPX...");
  const wspxAmount = ethers.parseEther("10000"); // 1万个 wSPX
  // @ts-ignore
  await wspx.mint(AUCTION_ADDRESS, wspxAmount);
  console.log(`✅ 已给拍卖合约铸造 10,000 wSPX`);

  // Step 3: Approve USDC 给拍卖合约
  console.log("\n📋 Step 3: 授权 USDC...");
  // @ts-ignore
  await usdc.approve(AUCTION_ADDRESS, ethers.MaxUint256);
  console.log(`✅ 已授权拍卖合约使用 USDC`);

  // Step 4: 检查拍卖状态
  console.log("\n📋 Step 4: 检查拍卖状态...");
  // @ts-ignore
  const isActive = await auction.isRoundActive();
  // @ts-ignore
  const currentRound = await auction.currentRoundId();
  console.log(`   当前轮次: Round #${currentRound}`);
  console.log(`   轮次状态: ${isActive ? "✅ 活跃" : "❌ 未开始"}`);

  // Step 5: 如果还没开始，开启第一轮
  if (!isActive) {
    console.log("\n📋 Step 5: 开启第一轮拍卖...");
    // @ts-ignore
    const tx = await auction.startNextRound();
    await tx.wait();
    console.log(`✅ 第一轮拍卖已开启！`);
  } else {
    console.log("\n✅ 拍卖轮次已在运行中！");
  }

  // Step 6: 显示余额
  console.log("\n📊 账户余额:");
  // @ts-ignore
  const usdcBalance = await usdc.balanceOf(deployer.address);
  // @ts-ignore
  const wspxBalance = await wspx.balanceOf(AUCTION_ADDRESS);
  console.log(`   USDC (部署者): ${ethers.formatEther(usdcBalance)}`);
  console.log(`   wSPX (拍卖合约): ${ethers.formatEther(wspxBalance)}`);

  console.log("\n🎉 初始化完成！现在可以开始模拟出价了！");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

