/**
 * @file auto_bot.ts
 * @description 华尔街级清算机器人 - 安全增强版
 * @notice 添加了事件追赶、精度处理、统一配置
 */

import { ethers } from "hardhat";
import Database from "better-sqlite3";
import path from "path";
import * as fs from "fs";
import { getAddress, BOT_CONFIG, DB_CONFIG, printAddresses, validateAddresses } from "../config/addresses";

// Debug logging helper
const DEBUG_LOG_PATH = path.resolve(__dirname, "..", ".cursor", "debug.log");
function debugLog(location: string, message: string, data: any = {}, hypothesisId: string = "") {
  try {
    const logEntry = JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId
    }) + '\n';
    fs.mkdirSync(path.dirname(DEBUG_LOG_PATH), { recursive: true });
    fs.appendFileSync(DEBUG_LOG_PATH, logEntry);
  } catch (e) {
    // Silent fail for debug logs
  }
}

// 使用配置文件中的数据库路径
const dbPath = path.resolve(__dirname, "..", DB_CONFIG.dbPath);
const db = new Database(dbPath);

// 启用 WAL 模式提高性能
db.pragma("journal_mode = WAL");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 安全的大数精度转换 - 避免浮点精度丢失
 * @param value BigInt 值
 * @param decimals 小数位数
 * @returns 字符串格式的数值
 */
function formatBigIntSafe(value: bigint, decimals: number = 18): string {
  const str = value.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, -decimals) || "0";
  const decPart = str.slice(-decimals);
  // 去除尾部多余的0，但保留至少4位小数
  const trimmedDec = decPart.slice(0, 4);
  return `${intPart}.${trimmedDec}`;
}

/**
 * 追赶历史事件 - 防止机器人重启丢失数据
 */
async function catchUpEvents(auction: any, fromBlock: number): Promise<number> {
  console.log(`📥 正在追赶历史事件 (从区块 ${fromBlock})...`);
  
  // #region agent log
  debugLog('auto_bot.ts:41', 'catchUpEvents called', {fromBlock, auctionAddress: auction.target || auction.address}, 'B');
  // #endregion
  
  try {
    // #region agent log
    debugLog('auto_bot.ts:44', 'Before creating filter', {}, 'B');
    // #endregion
    const filter = auction.filters.BidPlaced();
    // #region agent log
    debugLog('auto_bot.ts:46', 'After creating filter, before queryFilter', {filterType: typeof filter}, 'B');
    // #endregion
    const events = await auction.queryFilter(filter, fromBlock, "latest");
    // #region agent log
    debugLog('auto_bot.ts:48', 'After queryFilter success', {eventCount: events.length}, 'B');
    // #endregion
    
    if (events.length > 0) {
      console.log(`   找到 ${events.length} 个历史事件`);
      
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO bids (roundId, userAddress, amountUSDC, limitPrice, timestamp, txHash, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `);
      
      for (const event of events) {
        const { roundId, user, amount, limitPrice } = event.args;
        const amt = formatBigIntSafe(amount);
        const price = formatBigIntSafe(limitPrice);
        
        try {
          stmt.run(
            Number(roundId),
            user,
            amt,
            price,
            Date.now(),
            event.transactionHash
          );
        } catch (err: any) {
          // 忽略重复插入错误
          if (!err.message.includes("UNIQUE constraint failed")) {
            console.error("历史事件写入错误:", err.message);
          }
        }
      }
      
      // 返回最新区块号
      return events[events.length - 1].blockNumber;
    }
  } catch (err: any) {
    console.error("追赶事件错误:", err.message);
  }
  
  return fromBlock;
}

/**
 * 获取最后处理的区块号
 */
function getLastProcessedBlock(): number {
  try {
    const result = db.prepare(`
      SELECT value FROM metadata WHERE key = 'last_processed_block'
    `).get() as { value: string } | undefined;
    return result ? parseInt(result.value) : 0;
  } catch {
    return 0;
  }
}

/**
 * 保存最后处理的区块号
 */
function saveLastProcessedBlock(blockNumber: number): void {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_processed_block', ?)
    `).run(blockNumber.toString());
  } catch (err: any) {
    console.error("保存区块号失败:", err.message);
  }
}

async function main() {
  // #region agent log
  debugLog('auto_bot.ts:113', 'main() function started', {}, 'A');
  // #endregion
  console.log("🤖 华尔街级清算机器人 (安全增强版) 已启动");
  console.log("══════════════════════════════════════════════════════");
  
  // 验证配置
  if (!validateAddresses()) {
    console.error("❌ 配置验证失败，请检查 .env 文件");
    process.exit(1);
  }
  
  printAddresses();
  
  const [admin] = await ethers.getSigners();
  console.log(`👨‍✈️ 管理员账户: ${admin.address}`);
  
  const auctionAddress = getAddress("auction");
  // #region agent log
  debugLog('auto_bot.ts:128', 'Before getContractFactory', {auctionAddress}, 'C');
  // #endregion
  const Auction = await ethers.getContractFactory("BatchAuction");
  // #region agent log
  debugLog('auto_bot.ts:130', 'Before attach', {}, 'C');
  // #endregion
  const auction = Auction.attach(auctionAddress);
  // #region agent log
  debugLog('auto_bot.ts:132', 'After attach success', {auctionTarget: auction.target || auction.address}, 'C');
  // #endregion

  // 初始化元数据表 (如果不存在)
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // 追赶历史事件
  let lastBlock = getLastProcessedBlock();
  lastBlock = await catchUpEvents(auction, lastBlock);
  saveLastProcessedBlock(lastBlock);

  // 监听链上事件
  console.log("\n👂 正在监听链上 BidPlaced 事件...\n");
  
  // #region agent log
  debugLog('auto_bot.ts:146', 'Before setting up auction.on listener', {}, 'A');
  // #endregion
  
  // @ts-ignore
  auction.on("BidPlaced", async (roundId, user, amount, limitPrice, event) => {
    // #region agent log
    debugLog('auto_bot.ts:150', 'Event callback triggered', {roundId: roundId?.toString(), userType: typeof user, userValue: user?.slice?.(0, 10)}, 'D');
    // #endregion
    try {
      // 使用安全的精度转换
      const amt = formatBigIntSafe(amount);
      const price = formatBigIntSafe(limitPrice);
      
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO bids (roundId, userAddress, amountUSDC, limitPrice, timestamp, txHash, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `);
      
      stmt.run(
        Number(roundId),
        user,
        amt,
        price,
        Date.now(),
        event.log.transactionHash
      );
      
      // 更新最后处理的区块
      saveLastProcessedBlock(event.log.blockNumber);
      
      console.log(`📥 新订单: Round #${roundId} | 用户: ${user.slice(0, 8)}... | 限价: $${price} | 金额: ${amt} USDC`);
    } catch (err: any) {
      console.error("DB Write Error:", err.message);
    }
  });
  
  // #region agent log
  debugLog('auto_bot.ts:207', 'Event listener setup complete, entering main loop', {}, 'A');
  // #endregion

  while (true) {
    try {
      // #region agent log
      debugLog('auto_bot.ts:236', 'Main loop iteration start', {}, 'E');
      // #endregion
      // @ts-ignore
      const isActive = await auction.isRoundActive();
      // #region agent log
      debugLog('auto_bot.ts:238', 'After isRoundActive', {isActive}, 'E');
      // #endregion
      // @ts-ignore
      const currentRoundId = Number(await auction.currentRoundId());
      // #region agent log
      debugLog('auto_bot.ts:241', 'After currentRoundId', {currentRoundId}, 'E');
      // #endregion
      // @ts-ignore
      const lastTime = Number(await auction.lastClearingTime());
      // #region agent log
      debugLog('auto_bot.ts:244', 'After lastClearingTime', {lastTime}, 'E');
      // #endregion

      // === 状态 A: 竞价进行中 ===
      if (isActive) {
        const now = Math.floor(Date.now() / 1000);
        const roundDuration = BOT_CONFIG.roundDuration;
        const timeLeft = roundDuration - (now - lastTime);

        // 获取当前最高价
        const topBid = db.prepare(`
          SELECT MAX(CAST(limitPrice AS REAL)) as price FROM bids WHERE roundId = ?
        `).get(currentRoundId) as { price: number } | undefined;
        const currentTop = topBid?.price ?? 0;

        process.stdout.write(
          `\r⏳ Round #${currentRoundId} 进行中... [倒计时: ${timeLeft}s] | [最高出价: $${currentTop.toFixed(2)}]   `
        );

        if (timeLeft <= 0) {
          console.log("\n\n🛑 竞价时间结束！锁定订单簿，开始【撮合计算】...\n");

          // === 1. 生成深度订单簿报告 ===
          const SUPPLY = BOT_CONFIG.tokenSupplyPerRound;
          
          const bids = db.prepare(`
            SELECT * FROM bids 
            WHERE roundId = ? 
            ORDER BY CAST(limitPrice AS REAL) DESC, timestamp ASC
          `).all(currentRoundId) as any[];

          let accumulated = 0;
          let clearingPrice = BOT_CONFIG.minClearingPrice;
          let settledCount = 0;

          console.log(`📊 Round #${currentRoundId} 订单簿深度快照 (共 ${bids.length} 笔订单)`);
          console.log("─".repeat(90));
          console.log("排名\t| 用户\t\t| 心理限价 (Limit)\t| 认购量\t| 累积需求\t| 状态");
          console.log("─".repeat(90));

          // 准备分配数组
          const users: string[] = [];
          const tokenAmounts: bigint[] = [];
          const refundAmounts: bigint[] = [];

          let isFull = false;
          for (let i = 0; i < bids.length; i++) {
            const bid = bids[i];
            const bidPrice = parseFloat(bid.limitPrice);
            const bidAmount = parseFloat(bid.amountUSDC);
            const tokensWanted = bidAmount / bidPrice;

            let status = "❌ 待定";
            let allocatedTokens = 0;
            let refund = 0;

            if (!isFull) {
              accumulated += tokensWanted;
              status = "✅ 预成交";
              settledCount++;
              allocatedTokens = tokensWanted;

              if (accumulated >= SUPPLY) {
                // 边际订单处理
                const excess = accumulated - SUPPLY;
                allocatedTokens = tokensWanted - excess;
                refund = excess * bidPrice;
                clearingPrice = bidPrice;
                isFull = true;
                status = "🎯 边际成交";
              }
            } else {
              status = "❌ 出局 (价格过低)";
              refund = bidAmount; // 全额退款
            }

            // 记录分配
            users.push(bid.userAddress);
            tokenAmounts.push(ethers.parseEther(allocatedTokens.toFixed(18)));
            refundAmounts.push(ethers.parseEther(refund.toFixed(18)));

            // 打印订单详情 (只打印前10单和最后5单)
            if (i < 10 || i > bids.length - 5 || status.includes("边际")) {
              console.log(
                `#${i + 1}\t| ${bid.userAddress.slice(0, 6)}...\t| $${bidPrice.toFixed(2)}\t\t\t| ${tokensWanted.toFixed(1)}\t\t| ${Math.min(accumulated, SUPPLY).toFixed(1)} / ${SUPPLY}\t| ${status}`
              );
            }
          }

          // 兜底逻辑
          if (accumulated < SUPPLY && bids.length > 0) {
            clearingPrice = parseFloat(bids[bids.length - 1].limitPrice);
            console.log(`📉 未足额认购 (仅 ${accumulated.toFixed(1)}/${SUPPLY})，按地板价/末单价结算`);
          }

          // 确保价格在范围内
          clearingPrice = Math.max(BOT_CONFIG.minClearingPrice, Math.min(BOT_CONFIG.maxClearingPrice, clearingPrice));

          console.log("─".repeat(90));
          console.log(`💰 最终清算价 (Uniform Clearing Price): $${clearingPrice.toFixed(4)}`);
          console.log(`📦 总成交订单数: ${settledCount} / ${bids.length}`);
          console.log("─".repeat(90) + "\n");

          // === 2. 执行链上结算 ===
          console.log(`🔗 正在发送链上结算交易 (Price: $${clearingPrice})...`);
          const priceWei = ethers.parseEther(clearingPrice.toFixed(18));

          try {
            // 使用带分配信息的清算函数
            // @ts-ignore
            const tx = await auction.connect(admin).executeClearing(
              priceWei,
              users,
              tokenAmounts,
              refundAmounts
            );
            console.log(`⏳ 等待区块链确认 (Tx: ${tx.hash.slice(0, 10)}...)...`);
            await tx.wait();
          } catch (err: any) {
            // 如果失败，尝试简化版清算
            console.log("⚠️ 详细清算失败，尝试简化版...");
            // @ts-ignore
            const tx = await auction.connect(admin).executeClearingSimple(priceWei);
            await tx.wait();
          }

          console.log(`✅ Round #${currentRoundId} 链上结算成功！`);

          // 更新数据库中的订单状态
          db.prepare(`
            UPDATE bids SET status = 'CLEARED' WHERE roundId = ?
          `).run(currentRoundId);

          // === 3. 开启下一轮 ===
          console.log(`\n⏱️  系统将在 ${BOT_CONFIG.postClearingDelay / 1000}秒 后自动开启下一轮...`);
          await sleep(BOT_CONFIG.postClearingDelay);

          console.log("🚀 正在调用合约开启 Round #" + (currentRoundId + 1) + "...");
          // @ts-ignore
          const txStart = await auction.connect(admin).startNextRound();
          await txStart.wait();
          console.log(`🎉 Round #${currentRoundId + 1} 已启动！交易继续！\n`);
        }
      } else {
        // 异常状态恢复
        console.log(`\n⚠️ 检测到 Round #${currentRoundId} 处于停止状态，正在尝试自动重启...`);
        // @ts-ignore
        const txStart = await auction.connect(admin).startNextRound();
        await txStart.wait();
        console.log(`🎉 Round #${currentRoundId + 1} 已恢复启动！\n`);
      }
    } catch (e: any) {
      // #region agent log
      debugLog('auto_bot.ts:365', 'Main loop error caught', {errorMsg: e.message, errorStack: e.stack?.split('\n').slice(0, 3).join(' | ')}, 'E');
      // #endregion
      console.error("\n❌ Bot Error:", e.message);
      if (e.message.includes("Address not configured")) {
        console.error("请检查 .env 文件中的合约地址配置");
        process.exit(1);
      }
    }
    
    await sleep(BOT_CONFIG.pollingInterval);
  }
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
