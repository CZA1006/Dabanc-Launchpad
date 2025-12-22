/**
 * @file auto_bot.ts
 * @description 华尔街级清算机器人 (公平分配版 v2.0)
 * @notice 集成功能：
 * 1. CEX 模式：读取本地数据库订单，链上统一结算
 * 2. 🌟 公平分配：每用户最多获得 25% 供应量，防止大户垄断
 * 3. 防死锁：即使 0 订单也会发送空交易关闭轮次
 * 4. 余额检查：预检查用户链上 USDC 余额，剔除无效订单
 * 5. 库存检查：预检查 Auction 合约 wSPX 余额，防止发货失败
 */

import { ethers } from "hardhat";
import Database from "better-sqlite3";
import path from "path";
import { getAddress, BOT_CONFIG, DB_CONFIG, printAddresses, validateAddresses } from "../config/addresses";

// 🌟 公平分配配置
const MAX_PER_USER_PERCENT = 0.25;  // 每个用户最多获得 25% 供应量

// 🌟 路径与 Server 保持一致
const dbPath = path.resolve(__dirname, "..", "backend_db", "orders.db");
console.log(`📂 [Bot] 数据库路径: ${dbPath}`);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🤖 华尔街级清算机器人 (公平分配版 v3.0 - 高速版) 已启动");
  console.log(`⚙️ 每用户最大分配比例: ${MAX_PER_USER_PERCENT * 100}%`);
  console.log(`🚀 Gas 配置: Priority Fee = 10 gwei, Max Fee = 50 gwei`);
  
  const [admin] = await ethers.getSigners();
  console.log(`🔑 管理员钱包地址: ${admin.address}`);
  
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
          const MAX_PER_USER = SUPPLY * MAX_PER_USER_PERCENT;  // 🌟 每用户最大获得量

          // 🛡️ 库存安全检查 (防止合约没币导致交易 Revert)
          try {
            const tokenAddress = getAddress("auctionToken");
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
                continue;
            }
          } catch (e) {
            console.warn("⚠️ 库存检查跳过 (可能是配置问题)，继续尝试结算...");
          }
          
          // 从数据库读取订单 (按价格降序、时间升序)
          const bids = db.prepare(`
            SELECT * FROM bids 
            WHERE roundId = ? AND status != 'CLEARED'
            ORDER BY CAST(limitPrice AS REAL) DESC, timestamp ASC
          `).all(currentRoundId) as any[];

          console.log(`📊 订单数量: ${bids.length}`);

          // === 1. 撮合计算（确定清算价） ===
          let accumulated = 0;
          let clearingPrice = BOT_CONFIG.minClearingPrice;
          
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
          clearingPrice = Math.max(BOT_CONFIG.minClearingPrice, clearingPrice);

          console.log(`💰 清算价: $${clearingPrice.toFixed(4)}`);

          // === 2. 🌟 公平分配：构建结算名单 ===
          const users: string[] = [];
          const tokenAmounts: bigint[] = [];
          const costAmounts: bigint[] = [];
          
          // 记录每个用户累计获得的 token 数量
          const userAllocations: Record<string, number> = {};
          
          let allocatedTotal = 0;

          if (bids.length > 0) {
            console.log("🔍 执行公平分配算法...");
            
            // 第一轮：计算所有符合条件的订单
            const eligibleBids: any[] = [];
            for (const bid of bids) {
              const bidPrice = parseFloat(bid.limitPrice);
              if (bidPrice >= clearingPrice) {
                eligibleBids.push({
                  ...bid,
                  tokensWanted: parseFloat(bid.amountUSDC) / clearingPrice
                });
              }
            }
            
            console.log(`📋 符合条件订单: ${eligibleBids.length}`);
            
            // 第二轮：按顺序分配，但每用户有上限
            for (const bid of eligibleBids) {
              if (allocatedTotal >= SUPPLY) break;  // 供应已分配完
              
              const userAddr = bid.userAddress.toLowerCase();
              const currentUserAlloc = userAllocations[userAddr] || 0;
              
              // 计算此用户还能获得多少
              const userRemaining = MAX_PER_USER - currentUserAlloc;
              if (userRemaining <= 0) {
                console.log(`⚠️ 用户 ${userAddr.slice(0,6)}... 已达上限 (${MAX_PER_USER}), 跳过此订单`);
                continue;
              }
              
              // 计算此订单能分配多少
              const supplyRemaining = SUPPLY - allocatedTotal;
              let finalTokens = Math.min(
                bid.tokensWanted,     // 用户想要的
                userRemaining,        // 用户还能拿的
                supplyRemaining       // 剩余供应量
              );
              
              if (finalTokens <= 0) continue;
              
              const cost = finalTokens * clearingPrice;
              const costWei = ethers.parseEther(cost.toFixed(18));
              
              // 余额检查
              // @ts-ignore
              const userBal = await auction.userBalances(bid.userAddress);
              if (userBal >= costWei) {
                users.push(bid.userAddress);
                tokenAmounts.push(ethers.parseEther(finalTokens.toFixed(18)));
                costAmounts.push(costWei);
                
                userAllocations[userAddr] = currentUserAlloc + finalTokens;
                allocatedTotal += finalTokens;
                
                console.log(`✅ ${bid.userAddress.slice(0,6)}... 获得 ${finalTokens.toFixed(2)} wSPX (累计: ${userAllocations[userAddr].toFixed(2)})`);
              } else {
                console.log(`⚠️ 跳过 ${bid.userAddress.slice(0,6)}... (余额不足: ${ethers.formatEther(userBal)} < ${cost.toFixed(2)})`);
              }
            }
          }

          console.log(`📊 分配汇总: ${users.length} 人, 共 ${allocatedTotal.toFixed(2)} wSPX`);

          // === 3. 执行链上结算 (即使赢家为0也要发！) ===
          console.log(`🔗 发送结算交易...`);
          try {
            const priceWei = ethers.parseEther(clearingPrice.toFixed(18));
            
            // 🚀 优化 Gas 配置（降低预留额度，实际消耗会低很多）
            const tx = await auction.connect(admin).executeClearing(
              priceWei,
              users,
              tokenAmounts,
              costAmounts,
              { 
                gasLimit: 3000000,                                      // 降低 gasLimit
                maxPriorityFeePerGas: ethers.parseUnits("10", "gwei"),  // 给矿工 10 gwei 小费
                maxFeePerGas: ethers.parseUnits("50", "gwei")           // 最高支付 50 gwei
              } 
            );
            console.log(`⏳ Tx: ${tx.hash}`);
            console.log(`🔗 查看: https://sepolia.etherscan.io/tx/${tx.hash}`);
            
            // 等待交易确认，最多等待 120 秒
            console.log(`⏳ 等待链上确认 (最多 120 秒)...`);
            const receipt = await tx.wait(1);  // 等待 1 个区块确认
            console.log(`✅ Round #${currentRoundId} 结算完成！Gas Used: ${receipt?.gasUsed.toString()}`);
            
            // 标记数据库状态
            db.prepare(`UPDATE bids SET status = 'CLEARED' WHERE roundId = ?`).run(currentRoundId);

          } catch (err: any) {
            console.error("❌ 结算交易失败:", err.message);
            await sleep(5000);
            continue;
          }

          // === 4. 开启下一轮 ===
          console.log(`⏱️ 开启下一轮...`);
          try {
              const txStart = await auction.connect(admin).startNextRound({ 
                gasLimit: 300000,
                maxPriorityFeePerGas: ethers.parseUnits("10", "gwei"),
                maxFeePerGas: ethers.parseUnits("50", "gwei")
              });
              await txStart.wait(1);
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
            const tx = await auction.connect(admin).startNextRound({ 
              gasLimit: 300000,
              maxPriorityFeePerGas: ethers.parseUnits("10", "gwei"),
              maxFeePerGas: ethers.parseUnits("50", "gwei")
            });
            await tx.wait(1);
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
