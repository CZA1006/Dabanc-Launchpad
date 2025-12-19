import { ethers } from "hardhat";

/**
 * 测试动态供应量机制
 * 模拟多轮拍卖，验证供应量根据价格自动调整
 */

async function main() {
  console.log("🧪 动态供应量测试\n");
  console.log("═".repeat(60));
  
  // 1. 部署合约
  console.log("\n📦 Step 1: 部署测试合约...");
  const [deployer] = await ethers.getSigners();
  
  const MockToken = await ethers.getContractFactory("MockERC20");
  const usdc = await MockToken.deploy("Test USDC", "USDC");
  await usdc.waitForDeployment();
  
  const wspx = await MockToken.deploy("SpaceX Equity", "wSPX");
  await wspx.waitForDeployment();
  
  const TOTAL_SUPPLY = ethers.parseEther("10000"); // 测试用 1万个代币
  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = await Auction.deploy(
    await wspx.getAddress(),
    await usdc.getAddress(),
    TOTAL_SUPPLY
  );
  await auction.waitForDeployment();
  
  console.log(`✅ USDC: ${await usdc.getAddress()}`);
  console.log(`✅ wSPX: ${await wspx.getAddress()}`);
  console.log(`✅ Auction: ${await auction.getAddress()}`);
  console.log(`   总供应量: ${ethers.formatEther(TOTAL_SUPPLY)} wSPX`);
  
  // 2. 初始化
  console.log("\n📦 Step 2: 初始化...");
  // @ts-ignore
  await usdc.mint(deployer.address, ethers.parseEther("1000000"));
  // @ts-ignore
  await wspx.mint(await auction.getAddress(), TOTAL_SUPPLY);
  // @ts-ignore
  await usdc.approve(await auction.getAddress(), ethers.MaxUint256);
  // @ts-ignore
  await auction.setWhitelist([deployer.address], true);
  
  // 设置动态参数
  // @ts-ignore
  await auction.setDynamicSupplyParams(
    ethers.parseEther("10"),  // 目标价格 $10
    ethers.parseEther("50"),  // 每次调整 50个
    20                         // 容忍度 20%
  );
  
  console.log("✅ 初始化完成");
  
  // 3. 查询初始状态
  console.log("\n📊 Step 3: 初始状态");
  // @ts-ignore
  let stats = await auction.getSupplyStats();
  // @ts-ignore
  let config = await auction.getDynamicSupplyConfig();
  
  console.log(`   总供应: ${ethers.formatEther(stats[0])} wSPX`);
  console.log(`   已发行: ${ethers.formatEther(stats[1])} wSPX`);
  console.log(`   剩余量: ${ethers.formatEther(stats[2])} wSPX`);
  console.log(`   当前轮供应: ${ethers.formatEther(stats[3])} wSPX`);
  console.log(`   目标价格: $${ethers.formatEther(config[0])}`);
  console.log(`   调整步长: ${ethers.formatEther(config[1])} wSPX`);
  console.log(`   容忍度: ${config[2]}%`);
  
  // 4. 模拟第一轮 - 价格过高 ($25)
  console.log("\n🔄 Round 1: 模拟高价场景 (期望增加供应)");
  console.log("═".repeat(60));
  
  // @ts-ignore
  await auction.placeBid(ethers.parseEther("12500"), ethers.parseEther("25"));
  
  // 推进时间 - 等待轮次结束 (5分钟)
  await ethers.provider.send("evm_increaseTime", [301]); // 301秒
  await ethers.provider.send("evm_mine", []); // 挖一个新区块
  
  // 执行清算 - 手动设置高价
  // @ts-ignore
  await auction.executeClearing(
    ethers.parseEther("25"),  // 清算价格 $25 (高于目标价 $10 的 20%)
    [deployer.address],
    [ethers.parseEther("500")],  // 分配 500 个代币
    [ethers.parseEther("0")]     // 无退款
  );
  
  // @ts-ignore
  stats = await auction.getSupplyStats();
  console.log(`✅ Round 1 清算完成`);
  console.log(`   清算价格: $25 (超出目标价)`);
  console.log(`   已发行: ${ethers.formatEther(stats[1])} wSPX`);
  console.log(`   剩余量: ${ethers.formatEther(stats[2])} wSPX`);
  
  // 5. 开启第二轮 - 观察供应量增加
  console.log("\n🔄 Round 2: 开启新轮次 (自动调整供应)");
  console.log("═".repeat(60));
  
  // @ts-ignore
  await auction.startNextRound();
  // @ts-ignore
  stats = await auction.getSupplyStats();
  
  console.log(`✅ 供应量已调整！`);
  console.log(`   新轮次供应: ${ethers.formatEther(stats[3])} wSPX`);
  console.log(`   📈 ${stats[3] > ethers.parseEther("500") ? "✅ 供应增加 (价格过高)" : "❌ 供应未增加"}`);
  
  // 6. 模拟第二轮 - 价格过低 ($5)
  console.log("\n🔄 Round 2: 模拟低价场景 (期望减少供应)");
  // @ts-ignore
  await auction.placeBid(ethers.parseEther("2750"), ethers.parseEther("5"));
  
  // 推进时间
  await ethers.provider.send("evm_increaseTime", [301]);
  await ethers.provider.send("evm_mine", []);
  
  // @ts-ignore
  await auction.executeClearing(
    ethers.parseEther("5"),   // 清算价格 $5 (低于目标价 $10)
    [deployer.address],
    [ethers.parseEther("550")],
    [ethers.parseEther("0")]
  );
  
  // @ts-ignore
  stats = await auction.getSupplyStats();
  console.log(`✅ Round 2 清算完成`);
  console.log(`   清算价格: $5 (低于目标价)`);
  console.log(`   已发行: ${ethers.formatEther(stats[1])} wSPX`);
  
  // 7. 开启第三轮 - 观察供应量减少
  console.log("\n🔄 Round 3: 开启新轮次");
  // @ts-ignore
  await auction.startNextRound();
  // @ts-ignore
  stats = await auction.getSupplyStats();
  
  console.log(`✅ 供应量已调整！`);
  console.log(`   新轮次供应: ${ethers.formatEther(stats[3])} wSPX`);
  console.log(`   📉 ${stats[3] < ethers.parseEther("550") ? "✅ 供应减少 (价格过低)" : "❌ 供应未减少"}`);
  
  // 8. 最终统计
  console.log("\n📊 最终统计");
  console.log("═".repeat(60));
  // @ts-ignore
  stats = await auction.getSupplyStats();
  console.log(`   总供应: ${ethers.formatEther(stats[0])} wSPX`);
  console.log(`   已发行: ${ethers.formatEther(stats[1])} wSPX`);
  console.log(`   剩余量: ${ethers.formatEther(stats[2])} wSPX`);
  console.log(`   发行进度: ${Number(stats[4]) / 100}%`);
  console.log(`   当前轮供应: ${ethers.formatEther(stats[3])} wSPX`);
  
  console.log("\n✅ 动态供应量测试完成！");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

