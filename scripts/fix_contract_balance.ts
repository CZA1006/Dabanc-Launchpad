import { ethers } from "hardhat";
import dotenv from "dotenv";
dotenv.config();

const AUCTION_ADDRESS = process.env.AUCTION_ADDRESS || "";
// 注意：确保 .env 里 AUCTION_TOKEN_ADDRESS 是正确的 wSPX 合约地址
const TOKEN_ADDRESS = "0x980d5d7C293f9dD5c5f2711644f13971E3d0E694"; // 您日志里的 wSPX 地址

async function main() {
  console.log("🔍 开始诊断合约余额状态...");
  
  const [admin] = await ethers.getSigners();
  console.log(`👤 管理员: ${admin.address}`);
  console.log(`🏠 Auction 合约: ${AUCTION_ADDRESS}`);

  // 连接 wSPX 代币合约
  const token = await ethers.getContractAt("MockERC20", TOKEN_ADDRESS);
  
  // 1. 检查 Auction 合约里的 wSPX 余额
  const balance = await token.balanceOf(AUCTION_ADDRESS);
  console.log(`📊 合约当前持有 wSPX: ${ethers.formatEther(balance)}`);

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
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "";
  if (USDC_ADDRESS) {
      const usdc = await ethers.getContractAt("MockERC20", USDC_ADDRESS);
      const usdcBal = await usdc.balanceOf(AUCTION_ADDRESS);
      console.log(`💰 合约当前持有 USDC: ${ethers.formatEther(usdcBal)} (用户充值资金池)`);
  }
}

main().catch(console.error);