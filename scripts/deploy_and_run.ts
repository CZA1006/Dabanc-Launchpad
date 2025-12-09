import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

async function main() {
  console.log("🚀 部署带有 [KYC 合规模块] 的 Launchpad...\n");
  
  // 准备三个角色: 管理员, 合规用户(UserA), 黑客(UserB)
  const [deployer, userA, hacker] = await ethers.getSigners();

  // 1. 部署基础合约
  const MockToken = await ethers.getContractFactory("MockERC20");
  const spaceX = await MockToken.deploy("SpaceX", "wSPX");
  const usdc = await MockToken.deploy("USDC", "USDC");

  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = await Auction.deploy(await spaceX.getAddress(), await usdc.getAddress());

  // 2. 资金准备
  await usdc.mint(userA.address, ethers.parseEther("1000"));
  await usdc.mint(hacker.address, ethers.parseEther("1000"));
  await usdc.connect(userA).approve(await auction.getAddress(), ethers.parseEther("1000"));
  await usdc.connect(hacker).approve(await auction.getAddress(), ethers.parseEther("1000"));

  // 3. 执行 KYC (只批准 UserA)
  console.log("🛡️ 执行 KYC 审查...");
  await auction.setWhitelist([userA.address], true);
  console.log(`✅ 用户 A (${userA.address}) 已加入白名单`);
  console.log(`❌ 黑客 B (${hacker.address}) 未获授权\n`);

  // 4. 测试 User A (合规用户) 出价 -> 应该成功
  try {
    console.log("TEST 1: 合规用户尝试出价...");
    await auction.connect(userA).placeBid(ethers.parseEther("500"));
    console.log("✅ 成功: User A 出价 500 USDC");
  } catch (e) {
    console.log("❌ 失败: User A 出价被拒绝 (不应发生)");
  }

  // 5. 测试 Hacker (未授权用户) 出价 -> 应该失败
  try {
    console.log("\nTEST 2: 黑客尝试出价...");
    await auction.connect(hacker).placeBid(ethers.parseEther("500"));
    console.log("❌ 失败: 黑客竟然出价成功了！(严重漏洞)");
  } catch (error: any) {
    // 检查报错信息是否包含我们的自定义错误
    if (error.message.includes("KYC Required")) {
      console.log("✅ 拦截成功: 智能合约拒绝了非 KYC 用户的请求！");
    } else {
      console.log("❓ 拦截成功，但报错信息不匹配:", error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});