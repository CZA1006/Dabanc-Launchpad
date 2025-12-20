/**
 * @file auto_bot.ts
 * @description 华尔街级清算机器人 (CEX 终极稳定版)
 * @notice 集成功能：
 * 1. CEX 模式：读取本地数据库订单，链上统一结算
 * 2. 防死锁：即使 0 订单也会发送空交易关闭轮次
 * 3. 余额检查：预检查用户链上 USDC 余额，剔除无效订单
 * 4. 库存检查：预检查 Auction 合约 wSPX 余额，防止发货失败
 */

import { ethers } from "hardhat";
import Database from "better-sqlite3";
import path from "path";
import { getAddress, BOT_CONFIG, DB_CONFIG, printAddresses, validateAddresses } from "../config/addresses";

// 🌟 路径与 Server 保持一致
const dbPath = path.resolve(__dirname, "..", "backend_db", "orders.db");
console.log(`📂 [Bot] 数据库路径: ${dbPath}`);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🤖 华尔街级清算机器人 (CEX 终极稳定版) 已启动");
  
  const [admin] = await ethers.getSigners();
  const auctionAddress = getAddress("auction");
  const auction = await ethers.getContractAt("BatchAuction", auctionAddress);

  // 初始化数据库 (防止第一次运行报错)
  db.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)`);

  console.log(`✅ 正在监控合约: ${auctionAddress}`);

  while (true) {
    try {
      // 获取链上状态
      const isActive = await auction.isRoundActive();
      const currentRoundId = Number(await auction.currentRoundId());
      const lastTime = Number(await auction.lastClearingTime());

      if (isActive) {
        const latestBlock = await ethers.provider.getBlock('latest');
        const blockTimestamp = latestBlock?.timestamp || Math.floor(Date.now() / 1000);
        const timeLeft = BOT_CONFIG.roundDuration - (blockTimestamp - lastTime);

        process.stdout.write(`\r⏳ Round #${currentRoundId} 倒计时: ${timeLeft}s   `);

        // 结算缓冲期 (倒计时结束后再等15秒，确保数据同步)
        if (timeLeft <= -15) {
          console.log("\n\n🛑 竞价结束！准备结算...");

          const SUPPLY = BOT_CONFIG.tokenSupplyPerRound;

          // 🛡️ 新增：库存安全检查 (防止合约没币导致交易 Revert)
          try {
            const tokenAddress = getAddress("auctionToken"); // 需要确保 config/addresses.ts 里有这个 key，或者从 .env 读取
            // 如果 getAddress 报错，回退到环境变量或手动填写的地址
            const tokenAddrReal = tokenAddress || process.env.AUCTION_TOKEN_ADDRESS || "0x980d5d7C293f9dD5c5f2711644f13971E3d0E694"; 
            
            const auctionToken = await ethers.getContractAt("MockERC20", tokenAddrReal);
            const inventory = await auctionToken.balanceOf(auctionAddress);
            const required = ethers.parseEther(SUPPLY.toString());

            if (inventory < required) {
                console.error(`\n🚨 严重警告：合约 wSPX 库存不足！`);
                console.error(`   需要: ${SUPPLY} wSPX`);
                console.error(`   当前: ${ethers.formatEther(inventory)} wSPX`);
                console.log("⚠️ 跳过本次结算，系统将在 10秒 后重试...");
                console.log("💡 请运行: npx hardhat run scripts/fix_contract_balance.ts --network sepolia");
                await sleep(10000);
                continue; // 跳过本次循环，防止 Revert
            }
          } catch (e) {
            console.warn("⚠️ 库存检查跳过 (可能是配置问题)，继续尝试结算...");
          }
          
          // 从数据库读取订单
          const bids = db.prepare(`
            SELECT * FROM bids 
            WHERE roundId = ? AND status != 'CLEARED'
            ORDER BY CAST(limitPrice AS REAL) DESC, timestamp ASC
          `).all(currentRoundId) as any[];

          console.log(`📊 订单数量: ${bids.length}`);

          // === 1. 撮合计算 ===
          let accumulated = 0;
          let clearingPrice = BOT_CONFIG.minClearingPrice;
          
          // 只有在有订单时才计算价格
          if (bids.length > 0) {
            for (const bid of bids) {
                const tokensWanted = parseFloat(bid.amountUSDC) / parseFloat(bid.limitPrice);
                accumulated += tokensWanted;
                if (accumulated >= SUPPLY) {
                    clearingPrice = parseFloat(bid.limitPrice);
                    break;
                }
            }
            if (accumulated < SUPPLY) {
                clearingPrice = parseFloat(bids[bids.length - 1].limitPrice);
            }
          }
          // 价格兜底
          clearingPrice = Math.max(BOT_CONFIG.minClearingPrice, clearingPrice);

          // === 2. 构建结算名单 ===
          const users: string[] = [];
          const tokenAmounts: bigint[] = [];
          const costAmounts: bigint[] = [];
          
          let allocatedTotal = 0;
          accumulated = 0;

          if (bids.length > 0) {
            console.log("🔍 检查用户余额...");
            for (const bid of bids) {
                const bidPrice = parseFloat(bid.limitPrice);
                const bidAmount = parseFloat(bid.amountUSDC);

                if (bidPrice < clearingPrice) continue;

                const tokensCanBuy = bidAmount / clearingPrice;
                let finalTokens = 0;

                if (allocatedTotal < SUPPLY) {
                    finalTokens = tokensCanBuy;
                    accumulated += finalTokens;
                    if (accumulated > SUPPLY) {
                        finalTokens = tokensCanBuy - (accumulated - SUPPLY);
                        accumulated = SUPPLY;
                    }
                    allocatedTotal += finalTokens;

                    if (finalTokens > 0) {
                        const cost = finalTokens * clearingPrice;
                        const costWei = ethers.parseEther(cost.toFixed(18));
                        
                        // 余额检查，防止 Revert
                        // @ts-ignore
                        const userBal = await auction.userBalances(bid.userAddress);
                        if (userBal >= costWei) {
                            users.push(bid.userAddress);
                            tokenAmounts.push(ethers.parseEther(finalTokens.toFixed(18)));
                            costAmounts.push(costWei);
                        } else {
                            console.log(`⚠️ 跳过 ${bid.userAddress.slice(0,4)}... (余额不足: ${ethers.formatEther(userBal)} < ${cost})`);
                        }
                    }
                }
            }
          }

          console.log(`💰 清算价: $${clearingPrice.toFixed(4)} | 赢家: ${users.length} 人`);

          // === 3. 执行链上结算 (即使赢家为0也要发！) ===
          console.log(`🔗 发送结算交易...`);
          try {
            const priceWei = ethers.parseEther(clearingPrice.toFixed(18));
            
            // 🌟 强制设置高 Gas Limit，防止估算失败
            const tx = await auction.connect(admin).executeClearing(
              priceWei,
              users, // 空数组也没关系
              tokenAmounts,
              costAmounts,
              { gasLimit: 3000000 } 
            );
            console.log(`⏳ Tx: ${tx.hash}...`);
            await tx.wait();
            console.log(`✅ Round #${currentRoundId} 结算完成！`);
            
            // 标记数据库状态
            db.prepare(`UPDATE bids SET status = 'CLEARED' WHERE roundId = ?`).run(currentRoundId);

          } catch (err: any) {
            console.error("❌ 结算交易失败:", err.message);
            // 失败后稍作等待，让下一次循环重试 (或等待人工修复)
            await sleep(5000);
            continue;
          }

          // === 4. 开启下一轮 ===
          console.log(`⏱️ 开启下一轮...`);
          try {
              const txStart = await auction.connect(admin).startNextRound({ gasLimit: 500000 });
              await txStart.wait();
              console.log(`🎉 Round #${currentRoundId + 1} 启动成功！\n`);
          } catch (e: any) {
              if (e.message.includes("Round still active")) {
                  console.log("⚠️ 上一轮未正确关闭，重试结算...");
              } else {
                  console.log("⚠️ 开启新轮次跳过 (可能已自动开启)");
              }
          }
        }
      } else {
        // 卡死救援逻辑
        console.log(`\n⚠️ Round #${currentRoundId} 状态异常 (非 Active)，尝试强制开启下一轮...`);
        try {
            const tx = await auction.connect(admin).startNextRound({ gasLimit: 500000 });
            await tx.wait();
            console.log("🎉 恢复成功！");
        } catch (e) {
            await sleep(5000);
        }
      }
    } catch (e: any) {
      console.error("❌ Bot Error:", e.message);
      await sleep(2000);
    }
    await sleep(2000);
  }
}

main().catch(console.error);