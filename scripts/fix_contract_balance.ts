import { ethers } from "hardhat";
import dotenv from "dotenv";
import { getAddress, ACTIVE_NETWORK, NETWORKS } from "../config/addresses";
dotenv.config();

// 从环境变量或统一配置获取地址
const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || getAddress("auction");
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || getAddress("auctionToken");
const USDC_ADDRESS = process.env.USDC_ADDRESS || getAddress("usdc");

async function main() {
  const networkInfo = NETWORKS[ACTIVE_NETWORK] || NETWORKS.hyperliquid_testnet;
  console.log("🔍 开始诊断合约余额状态...");
  console.log(`🌐 网络: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);
  
  const [admin] = await ethers.getSigners();
  console.log(`👤 管理员: ${admin.address}`);
  console.log(`🏠 Auction 合约: ${AUCTION_ADDRESS}`);
  console.log(`🪙 Token 合约: ${TOKEN_ADDRESS}`);

  if (!TOKEN_ADDRESS || TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌ 错误: TOKEN_ADDRESS 未设置，请运行部署脚本或在 .env 中配置");
    process.exit(1);
  }

  // 连接 wSPX 代币合约
  const token = await ethers.getContractAt("MockERC20", TOKEN_ADDRESS);
  
  // 1. 检查 Auction 合约里的 wSPX 余额
  let balance;
  try {
    balance = await token.balanceOf(AUCTION_ADDRESS);
  console.log(`📊 合约当前持有 wSPX: ${ethers.formatEther(balance)}`);
  } catch (e: any) {
    console.error("❌ 无法获取余额，请检查 TOKEN_ADDRESS 是否在当前网络上正确部署");
    console.error(`   当前地址: ${TOKEN_ADDRESS}`);
    process.exit(1);
  }

  // 2. 如果余额不足，进行补充
  // 假设我们需要卖 1000万个币，如果少于 50万，就补货
  if (balance < ethers.parseEther("500000")) {
      console.log("⚠️  警告：合约内 wSPX 严重不足，会导致结算失败！");
      console.log("🚚 正在紧急补货 (Minting 1,000,000 wSPX)...");
      
      try {
          // 尝试直接给合约 Mint
          const tx = await token.mint(AUCTION_ADDRESS, ethers.parseEther("1000000"));
          console.log(`⏳ 等待确认 (Tx: ${tx.hash.slice(0,10)}...)...`);
          await tx.wait();
          console.log("✅ 补货成功！");
      } catch (e: any) {
          console.log("❌ Mint 失败，尝试从管理员转账...");
          // 如果 Mint 失败（权限问题），尝试从管理员转账
          const adminBal = await token.balanceOf(admin.address);
          if (adminBal > ethers.parseEther("1000000")) {
              const tx = await token.transfer(AUCTION_ADDRESS, ethers.parseEther("1000000"));
              await tx.wait();
              console.log("✅ 转账补货成功！");
          } else {
              console.error("❌ 管理员也没币了，请检查 Token 合约权限！");
          }
      }
  } else {
      console.log("✅ 余额充足，可以正常结算。");
  }

  // 3. 顺便检查一下 USDC 余额 (用于绿鞋机制退款测试等)
  if (USDC_ADDRESS && USDC_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      try {
      const usdc = await ethers.getContractAt("MockERC20", USDC_ADDRESS);
      const usdcBal = await usdc.balanceOf(AUCTION_ADDRESS);
      console.log(`💰 合约当前持有 USDC: ${ethers.formatEther(usdcBal)} (用户充值资金池)`);
      } catch (e) {
        console.warn("⚠️  无法获取 USDC 余额，请检查 USDC_ADDRESS 配置");
      }
  }
}

main().catch(console.error);