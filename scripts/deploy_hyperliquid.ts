/**
 * 部署脚本 - Hyperliquid 测试网 (HyperEVM Testnet)
 * 
 * 使用方法:
 * 1. 确保 .env 文件中设置了 PRIVATE_KEY
 * 2. 获取测试币 HYPE: 访问 Hyperliquid Discord 或官方 Faucet
 * 3. 运行: npx hardhat run scripts/deploy_hyperliquid.ts --network hyperliquid_testnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       🚀 DABANC Launchpad - Hyperliquid Testnet 部署       ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider.getBalance(deployer.address);
  
  console.log(`👨‍✈️ 部署账户: ${deployer.address}`);
  console.log(`💰 账户余额: ${ethers.formatEther(balance)} HYPE`);
  
  if (balance === 0n) {
    console.error("\n❌ 错误: 账户余额为 0，请先获取测试币 HYPE");
    console.log("   前往 Hyperliquid Discord 或官方渠道获取测试币");
    process.exit(1);
  }

  console.log("\n📋 开始部署合约...\n");

  // 1. 部署 USDC (模拟稳定币)
  console.log("Step 1/4: 部署 Mock USDC...");
  const MockToken = await ethers.getContractFactory("MockERC20");
  const usdc = await MockToken.deploy("Test USDC", "USDC");
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`   ✅ USDC 合约: ${usdcAddress}`);

  // 2. 部署 SpaceX 代币 (模拟 RWA Token)
  console.log("\nStep 2/4: 部署 SpaceX Token (wSPX)...");
  const spaceX = await MockToken.deploy("SpaceX Equity", "wSPX");
  await spaceX.waitForDeployment();
  const tokenAddress = await spaceX.getAddress();
  console.log(`   ✅ wSPX 合约: ${tokenAddress}`);

  // 3. 部署拍卖核心合约
  console.log("\nStep 3/4: 部署 BatchAuction 核心合约...");
  const TOTAL_SUPPLY = ethers.parseEther("10000000"); // 1000万 wSPX 总供应量
  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = await Auction.deploy(
    tokenAddress,
    usdcAddress,
    TOTAL_SUPPLY
  );
  await auction.waitForDeployment();
  const auctionAddress = await auction.getAddress();
  console.log(`   ✅ Auction 合约: ${auctionAddress}`);
  console.log(`   📊 总供应量: ${ethers.formatEther(TOTAL_SUPPLY)} wSPX`);

  // 4. 部署绿鞋金库 (GreenShoe Vault)
  console.log("\nStep 4/4: 部署 GreenShoe Vault...");
  const GreenShoe = await ethers.getContractFactory("GreenShoeVault");
  const vault = await GreenShoe.deploy(usdcAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  // 绑定合约关系
  console.log("   ⚙️  绑定 Auction <-> Vault...");
  await auction.setGreenShoeVault(vaultAddress);
  await vault.setAuctionContract(auctionAddress);
  console.log(`   ✅ Vault 合约: ${vaultAddress} (已绑定)`);

  // 5. 🛡️ 将部署者加入白名单
  console.log("\nStep 5/5: 初始化配置...");
  console.log("   ⚙️  将部署者加入白名单...");
  await auction.setWhitelist([deployer.address], true);
  console.log(`   ✅ ${deployer.address} 已加入白名单`);
  
  // 6. 给 Auction 合约充值 Token (用于发放给用户)
  console.log("   ⚙️  向 Auction 合约转入初始 Token 库存...");
  const initialTokenSupply = ethers.parseEther("1000000"); // 100万 wSPX 作为初始库存
  await spaceX.mint(auctionAddress, initialTokenSupply);
  console.log(`   ✅ 已向 Auction 合约转入 ${ethers.formatEther(initialTokenSupply)} wSPX`);

  // 输出部署结果
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    🎉 部署完成！                           ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  
  console.log("📝 合约地址汇总:");
  console.log("─".repeat(60));
  console.log(`   USDC_ADDRESS     = "${usdcAddress}"`);
  console.log(`   TOKEN_ADDRESS    = "${tokenAddress}"`);
  console.log(`   AUCTION_ADDRESS  = "${auctionAddress}"`);
  console.log(`   VAULT_ADDRESS    = "${vaultAddress}"`);
  console.log("─".repeat(60));

  // 🌟 自动更新 .env 文件
  const envPath = path.resolve(__dirname, "../.env");
  console.log("\n🔄 自动更新 .env 文件中的合约地址...");
  
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // 更新或添加环境变量的辅助函数
  const updateEnvVar = (content: string, key: string, value: string): string => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      return content.replace(regex, `${key}=${value}`);
    } else {
      return content + (content.endsWith("\n") ? "" : "\n") + `${key}=${value}\n`;
    }
  };

  // 更新合约地址
  envContent = updateEnvVar(envContent, "AUCTION_ADDRESS", auctionAddress);
  envContent = updateEnvVar(envContent, "USDC_ADDRESS", usdcAddress);
  envContent = updateEnvVar(envContent, "TOKEN_ADDRESS", tokenAddress);
  envContent = updateEnvVar(envContent, "VAULT_ADDRESS", vaultAddress);
  
  // 确保网络配置正确
  envContent = updateEnvVar(envContent, "HARDHAT_NETWORK", "hyperliquid_testnet");

  fs.writeFileSync(envPath, envContent);
  console.log("   ✅ .env 文件已更新");
  console.log("   📄 已写入以下环境变量:");
  console.log(`      AUCTION_ADDRESS=${auctionAddress}`);
  console.log(`      USDC_ADDRESS=${usdcAddress}`);
  console.log(`      TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`      VAULT_ADDRESS=${vaultAddress}`);
  console.log(`      HARDHAT_NETWORK=hyperliquid_testnet`);

  // 同时更新 constants.ts (前端使用)
  const constantsPath = path.resolve(__dirname, "../dabanc-frontend/src/constants.ts");
  
  if (fs.existsSync(constantsPath)) {
    console.log("\n🔄 同步更新 constants.ts (前端配置)...");
    
    let constantsContent = fs.readFileSync(constantsPath, "utf-8");
    
    // 更新 Hyperliquid 地址
    constantsContent = constantsContent.replace(
      /export const HYPERLIQUID_AUCTION_ADDRESS = ".*?" as const;/,
      `export const HYPERLIQUID_AUCTION_ADDRESS = "${auctionAddress}" as const;`
    );
    constantsContent = constantsContent.replace(
      /export const HYPERLIQUID_USDC_ADDRESS = ".*?" as const;/,
      `export const HYPERLIQUID_USDC_ADDRESS = "${usdcAddress}" as const;`
    );
    constantsContent = constantsContent.replace(
      /export const HYPERLIQUID_TOKEN_ADDRESS = ".*?" as const;/,
      `export const HYPERLIQUID_TOKEN_ADDRESS = "${tokenAddress}" as const;`
    );
    constantsContent = constantsContent.replace(
      /export const HYPERLIQUID_VAULT_ADDRESS = ".*?" as const;/,
      `export const HYPERLIQUID_VAULT_ADDRESS = "${vaultAddress}" as const;`
    );
    
    fs.writeFileSync(constantsPath, constantsContent);
    console.log("   ✅ constants.ts 已更新");
  }

  // 输出后续步骤
  console.log("\n📌 后续步骤:");
  console.log("─".repeat(60));
  console.log("1. 合约地址已自动写入 .env 文件，无需手动配置");
  console.log("2. 启动后端服务: npx ts-node scripts/server.ts");
  console.log("3. 启动清算机器人: npx hardhat run scripts/auto_bot.ts --network hyperliquid_testnet");
  console.log("4. 启动流量模拟: npx hardhat run scripts/simulate_traffic.ts --network hyperliquid_testnet");
  console.log("5. 启动前端: cd dabanc-frontend && npm run dev");
  console.log("\n🦊 MetaMask 网络配置:");
  console.log("   - 网络名称: Hyperliquid Testnet");
  console.log("   - RPC URL: https://rpc.hyperliquid-testnet.xyz/evm");
  console.log("   - Chain ID: 998");
  console.log("   - 货币符号: HYPE");
  console.log("   - 区块浏览器: https://explorer.hyperliquid-testnet.xyz");
  console.log("─".repeat(60));

  // 保存部署信息到文件
  const deploymentInfo = {
    network: "hyperliquid_testnet",
    chainId: 998,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      USDC: usdcAddress,
      TOKEN: tokenAddress,
      AUCTION: auctionAddress,
      VAULT: vaultAddress,
    },
    explorer: "https://explorer.hyperliquid-testnet.xyz",
  };

  const deploymentPath = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentPath, `hyperliquid_testnet_${Date.now()}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 部署信息已保存至: ${deploymentFile}`);
}

main().catch((error) => {
  console.error("\n❌ 部署失败:", error);
  process.exitCode = 1;
});

