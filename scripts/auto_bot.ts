/**
 * @file auto_bot.ts
 * @description 华尔街级清算机器人 - 支持本地网络和 Sepolia
 * @notice 从 .env 读取配置，支持多网络部署
 */

import { ethers } from "hardhat";
import Database from "better-sqlite3";
import path from "path";
import { getAddress, BOT_CONFIG, DB_CONFIG, printAddresses, validateAddresses } from "../config/addresses";

// 使用配置文件中的数据库路径
const dbPath = path.resolve(__dirname, "..", DB_CONFIG.dbPath);
const db = new Database(dbPath);

// 启用 WAL 模式提高性能
db.pragma("journal_mode = WAL");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 安全的大数精度转换 - 避免浮点精度丢失
 */
function formatBigIntSafe(value: bigint, decimals: number = 18): string {
  const str = value.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, -decimals) || "0";
  const decPart = str.slice(-decimals);
  const trimmedDec = decPart.slice(0, 4);
  return `${intPart}.${trimmedDec}`;
}

/**
 * 追赶历史事件 - 防止机器人重启丢失数据
 */
async function catchUpEvents(auction: any, fromBlock: number): Promise<number> {
  console.log(`📥 正在追赶历史事件 (从区块 ${fromBlock})...`);
  
  try {
    const filter = auction.filters.BidPlaced();
    const events = await auction.queryFilter(filter, fromBlock, "latest");
    
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
          if (!err.message.includes("UNIQUE constraint failed")) {
            console.error("历史事件写入错误:", err.message);
          }
        }
      }
      
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
  console.log("🤖 华尔街级清算机器人 已启动");
  console.log("══════════════════════════════════════════════════════");
  
  // 显示当前网络
  const network = await ethers.provider.getNetwork();
  console.log(`🌐 当前网络: ${network.name} (chainId: ${network.chainId})`);
  
  // 验证配置
  if (!validateAddresses()) {
    console.error("❌ 配置验证失败，请检查 .env 文件");
    process.exit(1);
  }
  
  printAddresses();
  
  // 显示 Bot 配置
  console.log("\n⚙️  Bot 配置:");
  console.log(`   轮询间隔: ${BOT_CONFIG.pollingInterval}ms`);
  console.log(`   清算后等待: ${BOT_CONFIG.postClearingDelay}ms`);
  console.log(`   轮次时长: ${BOT_CONFIG.roundDuration}s`);
  console.log(`   每轮供应: ${BOT_CONFIG.tokenSupplyPerRound} 代币`);
  
  const [admin] = await ethers.getSigners();
  console.log(`\n👨‍✈️ 管理员账户: ${admin.address}`);
  
  // 检查管理员余额
  const balance = await ethers.provider.getBalance(admin.address);
  console.log(`💰 账户余额: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === BigInt(0)) {
    console.error("⚠️  警告: 管理员账户 ETH 余额为 0，无法发送交易！");
  }
  
  const auctionAddress = getAddress("auction");
  const auction = await ethers.getContractAt("BatchAuction", auctionAddress);

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
  
  // @ts-ignore - ethers v6 类型问题
  auction.on("BidPlaced", async (roundId, user, amount, limitPrice, event) => {
    try {
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
      
      saveLastProcessedBlock(event.log.blockNumber);
      
      console.log(`📥 新订单: Round #${roundId} | 用户: ${user.slice(0, 8)}... | 限价: $${price} | 金额: ${amt} USDC`);
    } catch (err: any) {
      console.error("DB Write Error:", err.message);
    }
  });

  while (true) {
    try {
      const isActive = await auction.isRoundActive();
      const currentRoundId = Number(await auction.currentRoundId());
      const lastTime = Number(await auction.lastClearingTime());

      // === 状态 A: 竞价进行中 ===
      if (isActive) {
        // 使用链上区块时间，而不是本地时间（解决 Sepolia 时间不同步问题）
        const latestBlock = await ethers.provider.getBlock('latest');
        const blockTimestamp = latestBlock?.timestamp || Math.floor(Date.now() / 1000);
        const roundDuration = BOT_CONFIG.roundDuration;
        const timeLeft = roundDuration - (blockTimestamp - lastTime);

        // 获取当前最高价
        const topBid = db.prepare(`
          SELECT MAX(CAST(limitPrice AS REAL)) as price FROM bids WHERE roundId = ?
        `).get(currentRoundId) as { price: number } | undefined;
        const currentTop = topBid?.price ?? 0;

        process.stdout.write(
          `\r⏳ Round #${currentRoundId} 进行中... [倒计时: ${timeLeft}s] | [最高出价: $${currentTop.toFixed(2)}]   `
        );

        // 增加安全缓冲：确保链上时间真正超过结束时间（避免 TimeNotUp 错误）
        const CLEARING_BUFFER = 15; // 多等 15 秒确保链上时间同步
        
        if (timeLeft <= -CLEARING_BUFFER) {
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
                const excess = accumulated - SUPPLY;
                allocatedTokens = tokensWanted - excess;
                refund = excess * bidPrice;
                clearingPrice = bidPrice;
                isFull = true;
                status = "🎯 边际成交";
              }
            } else {
              status = "❌ 出局 (价格过低)";
              refund = bidAmount;
            }

            users.push(bid.userAddress);
            tokenAmounts.push(ethers.parseEther(allocatedTokens.toFixed(18)));
            refundAmounts.push(ethers.parseEther(refund.toFixed(18)));

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

          clearingPrice = Math.max(BOT_CONFIG.minClearingPrice, Math.min(BOT_CONFIG.maxClearingPrice, clearingPrice));

          console.log("─".repeat(90));
          console.log(`💰 最终清算价 (Uniform Clearing Price): $${clearingPrice.toFixed(4)}`);
          console.log(`📦 总成交订单数: ${settledCount} / ${bids.length}`);
          console.log("─".repeat(90) + "\n");

          // === 2. 执行链上结算 ===
          console.log(`🔗 正在发送链上结算交易 (Price: $${clearingPrice})...`);
          const priceWei = ethers.parseEther(clearingPrice.toFixed(18));

          try {
            const tx = await auction.connect(admin).executeClearing(
              priceWei,
              users,
              tokenAmounts,
              refundAmounts
            );
            console.log(`⏳ 等待区块链确认 (Tx: ${tx.hash.slice(0, 10)}...)...`);
            await tx.wait();
          } catch (err: any) {
            console.log("⚠️ 详细清算失败，尝试简化版...");
            const tx = await auction.connect(admin).executeClearingSimple(priceWei);
            await tx.wait();
          }

          console.log(`✅ Round #${currentRoundId} 链上结算成功！`);

          db.prepare(`
            UPDATE bids SET status = 'CLEARED' WHERE roundId = ?
          `).run(currentRoundId);

          // === 3. 自动提款 (可选) ===
          if (BOT_CONFIG.autoWithdraw) {
            try {
              const availableProceeds = await auction.getAvailableProceeds();
              if (availableProceeds > 0n) {
                console.log(`\n💰 检测到可提取资金: ${ethers.formatEther(availableProceeds)} USDC`);
                console.log("📤 正在自动提款至 Owner 账户...");
                const withdrawTx = await auction.connect(admin).withdrawProceeds();
                await withdrawTx.wait();
                console.log(`✅ 提款成功！已转入: ${admin.address.slice(0, 10)}...`);
              }
            } catch (withdrawErr: any) {
              console.log("⚠️ 自动提款跳过:", withdrawErr.message.slice(0, 50));
            }
          }

          // === 4. 开启下一轮 ===
          console.log(`\n⏱️  系统将在 ${BOT_CONFIG.postClearingDelay / 1000}秒 后自动开启下一轮...`);
          await sleep(BOT_CONFIG.postClearingDelay);

          // 再次检查轮次状态，确保清算已完成
          const stillActive = await auction.isRoundActive();
          if (stillActive) {
            console.log("⚠️  轮次仍然活跃，跳过开启新轮次（可能清算未完成）");
          } else {
            console.log("🚀 正在调用合约开启 Round #" + (currentRoundId + 1) + "...");
            try {
              const txStart = await auction.connect(admin).startNextRound();
              await txStart.wait();
              console.log(`🎉 Round #${currentRoundId + 1} 已启动！交易继续！\n`);
            } catch (startErr: any) {
              console.error("⚠️  开启新轮次失败:", startErr.message.slice(0, 100));
            }
          }
        }
      } else {
        // 轮次不活跃，尝试开启新轮次
        console.log(`\n⚠️ 检测到轮次 #${currentRoundId} 处于停止状态`);
        
        // 检查是否所有代币已发行
        const supplyStats = await auction.getSupplyStats();
        const allIssued = supplyStats[1] >= supplyStats[0];
        
        if (allIssued) {
          console.log("🏁 所有代币已发行完毕，拍卖结束！");
          console.log(`   总发行: ${ethers.formatEther(supplyStats[1])} / ${ethers.formatEther(supplyStats[0])} wSPX`);
          process.exit(0);
        }
        
        console.log("🚀 正在尝试开启新轮次...");
        try {
          const txStart = await auction.connect(admin).startNextRound();
          await txStart.wait();
          console.log(`🎉 Round #${currentRoundId + 1} 已启动！\n`);
        } catch (startErr: any) {
          console.error("⚠️  开启新轮次失败:", startErr.message.slice(0, 100));
          // 等待后重试
          await sleep(10000);
        }
      }
    } catch (e: any) {
      console.error("\n❌ Bot Error:", e.message);
      if (e.message.includes("Address not configured") || e.message.includes("地址未配置")) {
        console.error("请检查 .env 文件中的合约地址配置");
        process.exit(1);
      }
      // Sepolia 网络可能有临时性错误，不退出继续重试
    }
    
    await sleep(BOT_CONFIG.pollingInterval);
  }
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
