import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 1. 确保 backend_db 文件夹存在
const dbDir = path.join(__dirname, '../backend_db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'orders.db');

// 2. 连接数据库 (如果不存在会自动创建)
console.log(`💽 正在连接数据库: ${dbPath}`);
const db = new Database(dbPath);

// 3. 启用 WAL 模式 (Write-Ahead Logging) 以提高并发性能
db.pragma('journal_mode = WAL');

// 4. 创建表结构
// better-sqlite3 是同步执行的，不需要回调函数，非常清爽
try {
  // A. 创建订单表 (Bids)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roundId INTEGER,
      userAddress TEXT,
      amountUSDC REAL,
      limitPrice REAL,
      timestamp INTEGER,
      txHash TEXT,
      status TEXT DEFAULT 'PENDING' -- PENDING, MATCHED, REJECTED
    )
  `);
  console.log("✅ 'bids' 表准备就绪");

  // B. 创建轮次表 (Rounds)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rounds (
      roundId INTEGER PRIMARY KEY,
      clearingPrice REAL,
      totalVolume REAL,
      totalTokensSold REAL,
      clearingTimestamp INTEGER
    )
  `);
  console.log("✅ 'rounds' 表准备就绪");

} catch (error: any) {
  console.error("❌ 初始化数据库失败:", error.message);
} finally {
  db.close();
  console.log("🎉 数据库初始化流程结束！");
}