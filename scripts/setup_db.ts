/**
 * @file setup_db.ts
 * @description 数据库初始化脚本 - 安全增强版
 * @notice 添加了索引、扩展字段、元数据表
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// 1. 确保 backend_db 文件夹存在
const dbDir = path.join(__dirname, "../backend_db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "orders.db");

// 2. 连接数据库 (如果不存在会自动创建)
console.log(`💽 正在连接数据库: ${dbPath}`);
const db = new Database(dbPath);

// 3. 启用 WAL 模式 (Write-Ahead Logging) 以提高并发性能
db.pragma("journal_mode = WAL");
// 启用外键约束
db.pragma("foreign_keys = ON");

// 4. 创建表结构
try {
  console.log("\n📊 正在创建/更新数据库表结构...\n");

  // ===== A. 创建订单表 (Bids) - 扩展版 =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roundId INTEGER NOT NULL,
      userAddress TEXT NOT NULL,
      amountUSDC TEXT NOT NULL,
      limitPrice TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      txHash TEXT UNIQUE,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'MATCHED', 'REJECTED', 'CLEARED', 'REFUNDED')),
      -- 扩展字段 (清算后填充)
      tokensAllocated TEXT DEFAULT '0',
      refundAmount TEXT DEFAULT '0',
      finalPrice TEXT DEFAULT '0',
      claimTxHash TEXT,
      refundTxHash TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ 'bids' 表准备就绪");

  // ===== B. 创建轮次表 (Rounds) - 扩展版 =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS rounds (
      roundId INTEGER PRIMARY KEY,
      clearingPrice TEXT,
      totalVolume TEXT,
      totalTokensSold TEXT,
      participantCount INTEGER DEFAULT 0,
      successfulBids INTEGER DEFAULT 0,
      rejectedBids INTEGER DEFAULT 0,
      greenShoeFund TEXT DEFAULT '0',
      clearingTimestamp INTEGER,
      clearingTxHash TEXT,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLEARING', 'CLEARED', 'CANCELLED')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ 'rounds' 表准备就绪");

  // ===== C. 创建用户表 (Users) =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      isWhitelisted INTEGER DEFAULT 0,
      totalBidAmount TEXT DEFAULT '0',
      totalTokensReceived TEXT DEFAULT '0',
      totalRefunds TEXT DEFAULT '0',
      participatedRounds INTEGER DEFAULT 0,
      firstSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastActiveAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ 'users' 表准备就绪");

  // ===== D. 创建元数据表 (Metadata) =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ 'metadata' 表准备就绪");

  // ===== E. 创建事件日志表 (Event Logs) =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventType TEXT NOT NULL,
      blockNumber INTEGER,
      txHash TEXT,
      data TEXT,
      processedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ 'event_logs' 表准备就绪");

  // ===== 创建索引 =====
  console.log("\n📑 正在创建索引...\n");

  // Bids 表索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bids_roundId ON bids(roundId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bids_userAddress ON bids(userAddress)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bids_limitPrice ON bids(CAST(limitPrice AS REAL) DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bids_timestamp ON bids(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bids_round_price ON bids(roundId, CAST(limitPrice AS REAL) DESC)`);
  console.log("✅ bids 表索引创建完成");

  // Rounds 表索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rounds_timestamp ON rounds(clearingTimestamp)`);
  console.log("✅ rounds 表索引创建完成");

  // Event logs 表索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type ON event_logs(eventType)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_block ON event_logs(blockNumber)`);
  console.log("✅ event_logs 表索引创建完成");

  // ===== 创建触发器 (自动更新 updatedAt) =====
  console.log("\n⚡ 正在创建触发器...\n");

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_bids_updated 
    AFTER UPDATE ON bids
    BEGIN
      UPDATE bids SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `);
  console.log("✅ bids 更新触发器创建完成");

  // ===== 插入初始元数据 =====
  const insertMeta = db.prepare(`
    INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)
  `);
  
  insertMeta.run("schema_version", "2.0.0");
  insertMeta.run("last_processed_block", "0");
  insertMeta.run("created_at", new Date().toISOString());
  console.log("✅ 初始元数据插入完成");

  // ===== 打印数据库统计信息 =====
  console.log("\n" + "═".repeat(50));
  console.log("📊 数据库统计信息:");
  console.log("═".repeat(50));

  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all() as { name: string }[];
  
  console.log(`\n📋 表列表 (${tables.length} 个):`);
  tables.forEach((t) => {
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get() as { cnt: number };
    console.log(`   - ${t.name.padEnd(15)} : ${count.cnt} 条记录`);
  });

  const indexes = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name
  `).all() as { name: string }[];
  
  console.log(`\n📑 索引列表 (${indexes.length} 个):`);
  indexes.forEach((i) => console.log(`   - ${i.name}`));

  console.log("\n" + "═".repeat(50));

} catch (error: any) {
  console.error("❌ 初始化数据库失败:", error.message);
  process.exit(1);
} finally {
  db.close();
  console.log("\n🎉 数据库初始化流程结束！");
  console.log(`📁 数据库文件: ${dbPath}\n`);
}
