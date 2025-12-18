import { ethers } from "hardhat";
import Database from 'better-sqlite3';
import path from 'path';

// ⚠️ 确保填入最新部署的合约地址
const AUCTION_ADDRESS = "0xc9AeBb8D366113383BB243bD9299b3392C30421c"; 

// 连接数据库
const dbPath = path.join(__dirname, '../backend_db/orders.db');
const db = new Database(dbPath);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🤖 华尔街级清算机器人 (可视化增强版) 已启动");
  console.log("------------------------------------------------------");
  
  const [admin] = await ethers.getSigners();
  const Auction = await ethers.getContractFactory("BatchAuction");
  const auction = Auction.attach(AUCTION_ADDRESS);

  // 监听链上事件 (保持不变，用于录入数据)
  console.log("👂 正在监听链上 BidPlaced 事件...");
  // @ts-ignore
  auction.on("BidPlaced", (roundId, user, amount, limitPrice, event) => {
      try {
          const amt = parseFloat(ethers.formatEther(amount));
          const price = parseFloat(ethers.formatEther(limitPrice));
          const stmt = db.prepare(`
            INSERT INTO bids (roundId, userAddress, amountUSDC, limitPrice, timestamp, txHash, status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
          `);
          stmt.run(Number(roundId), user, amt, price, Date.now(), event.log.transactionHash);
          // 简化日志，保持控制台清爽，结算时再详细展示
          // console.log(`📥 写入: Round #${roundId} | $${price} | ${amt}U`); 
      } catch (err) {
          console.error("DB Write Error:", err);
      }
  });

  while (true) {
    try {
      // @ts-ignore
      const isActive = await auction.isRoundActive();
      // @ts-ignore
      const currentRoundId = Number(await auction.currentRoundId());
      // @ts-ignore
      const lastTime = Number(await auction.lastClearingTime());

      // === 状态 A: 竞价进行中 ===
      if (isActive) {
        const now = Math.floor(Date.now() / 1000);
        const roundDuration = 300; // 5分钟
        const timeLeft = roundDuration - (now - lastTime);
        
        // 动态展示当前最高价 (Orderbook Top)
        const topBid = db.prepare(`SELECT max(limitPrice) as price FROM bids WHERE roundId = ?`).get(currentRoundId);
        // @ts-ignore
        const currentTop = topBid && topBid.price ? topBid.price : 0;

        process.stdout.write(`\r⏳ Round #${currentRoundId} 进行中... [倒计时: ${timeLeft}s] | [最高出价: $${currentTop}]   `);

        if (timeLeft <= 0) {
          console.log("\n\n🛑 竞价时间结束！锁定订单簿，开始【撮合计算】...\n");
          
          // === 1. 生成深度订单簿报告 ===
          const SUPPLY = 500;
          // 按价格从高到低排序，价格相同按时间优先
          const bids = db.prepare(`
            SELECT * FROM bids WHERE roundId = ? ORDER BY limitPrice DESC, timestamp ASC
          `).all(currentRoundId);
          
          let accumulated = 0;
          let clearingPrice = 1.0;
          let settledCount = 0;

          console.log(`📊 Round #${currentRoundId} 订单簿深度快照 (共 ${bids.length} 笔订单)`);
          console.log("--------------------------------------------------------------------------------");
          console.log("排名\t| 用户\t\t| 心理限价 (Limit)\t| 认购量\t| 累积需求\t| 状态");
          console.log("--------------------------------------------------------------------------------");

          // 核心撮合循环：寻找“出清点”
          let isFull = false;
          for (let i = 0; i < bids.length; i++) {
              const bid = bids[i];
              // 假设按限价成交，计算购买力
              const tokensWanted = bid.amountUSDC / bid.limitPrice;
              
              let status = "❌ 待定";
              
              // 如果还没有满额
              if (!isFull) {
                  accumulated += tokensWanted;
                  status = "✅ 预成交";
                  settledCount++;
                  
                  // 检查是否刚好跨过 500 的线
                  if (accumulated >= SUPPLY) {
                      clearingPrice = bid.limitPrice; // 这就是边际价格！
                      isFull = true;
                      status = "🎯 边际成交"; // 这一单决定了全场价格
                  }
              } else {
                  status = "❌ 出局 (价格过低)";
              }

              // 打印详细条目 (为了演示效果，只打印前10单和最后5单，防止刷屏，或者您想看全部就去掉if)
              if (i < 10 || i > bids.length - 5 || status.includes("边际")) {
                 console.log(`#${i+1}\t| ${bid.userAddress.slice(0,6)}...\t| $${bid.limitPrice.toFixed(2)}\t\t\t| ${tokensWanted.toFixed(1)}\t\t| ${accumulated.toFixed(1)} / 500\t| ${status}`);
              }
          }
          
          // 兜底逻辑：如果没卖完，按最后一单或底价
          if (accumulated < SUPPLY && bids.length > 0) {
              clearingPrice = bids[bids.length-1].limitPrice;
              console.log(`📉 未足额认购 (仅 ${accumulated.toFixed(1)}/500)，按地板价/末单价结算`);
          }

          console.log("--------------------------------------------------------------------------------");
          console.log(`💰 最终清算价 (Uniform Clearing Price): $${clearingPrice.toFixed(4)}`);
          console.log(`📦 总成交订单数: ${settledCount} / ${bids.length}`);
          console.log("--------------------------------------------------------------------------------\n");

          // === 2. 执行链上结算 (严格同步) ===
          console.log(`🔗 正在发送链上结算交易 (Price: $${clearingPrice})...`);
          const priceWei = ethers.parseEther(clearingPrice.toFixed(18));
          // @ts-ignore
          const tx = await auction.connect(admin).executeClearing(priceWei);
          console.log(`⏳ 等待区块链确认 (Tx: ${tx.hash.slice(0,10)}...)...`);
          await tx.wait(); // 🌟 这里会死等，直到以太坊出块确认，绝不会抢跑
          
          console.log(`✅ Round #${currentRoundId} 链上结算成功！所有资金已处理完毕。`);
          
          // === 3. 开启下一轮 (严格等待) ===
          console.log("\n⏱️  系统将在 5秒 后自动开启下一轮...");
          await sleep(5000); // 额外的缓冲时间，让您有时间看清上面的日志
          
          console.log("🚀 正在调用合约开启 Round #" + (currentRoundId + 1) + "...");
          // @ts-ignore
          const txStart = await auction.connect(admin).startNextRound();
          await txStart.wait();
          console.log(`🎉 Round #${currentRoundId + 1} 已启动！交易继续！\n`);
        }
      } 
      else {
        // 异常状态恢复
        console.log(`\n⚠️ 检测到 Round #${currentRoundId} 处于停止状态，正在尝试自动重启...`);
        // @ts-ignore
        const txStart = await auction.connect(admin).startNextRound();
        await txStart.wait();
        console.log(`🎉 Round #${currentRoundId + 1} 已恢复启动！\n`);
      }

    } catch (e: any) {
      console.log("Bot Error:", e.message);
    }
    await sleep(2000);
  }
}

main().catch(console.error);