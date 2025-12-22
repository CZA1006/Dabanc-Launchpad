// scripts/server.ts
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import path from 'path';
import { ethers } from 'ethers';

const PORT = 3001;
// 🌟 强制指定路径：根目录下的 backend_db/orders.db
const dbPath = path.resolve(__dirname, "..", "backend_db", "orders.db");
console.log(`📂 [Server] 数据库路径: ${dbPath}`);

const db = new Database(dbPath);
const app = express();
app.use(cors());
app.use(bodyParser.json());

// 初始化表
db.exec(`
  CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roundId INTEGER,
    userAddress TEXT,
    amountUSDC TEXT,
    limitPrice TEXT,
    timestamp INTEGER,
    txHash TEXT UNIQUE, 
    status TEXT
  );
`);

// 接收订单接口
app.post('/api/bid', (req, res) => {
  try {
    const { roundId, userAddress, amount, limitPrice } = req.body;
    if (!roundId || !userAddress || !amount || !limitPrice) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const mockHash = ethers.id(`${userAddress}-${Date.now()}-${Math.random()}`);
    const stmt = db.prepare(`
      INSERT INTO bids (roundId, userAddress, amountUSDC, limitPrice, timestamp, txHash, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `);
    
    stmt.run(Number(roundId), userAddress, amount.toString(), limitPrice.toString(), Date.now(), mockHash);
    console.log(`🚀 [API] 新订单: Round #${roundId} | ${amount} U @ $${limitPrice}`);
    res.json({ success: true, txHash: mockHash });
  } catch (e: any) {
    console.error("API Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// 查询接口
app.get('/api/orders', (req, res) => {
  try {
    const { roundId } = req.query;
    if (!roundId) return res.status(400).json({ error: 'Missing roundId' });
    const bids = db.prepare(`SELECT * FROM bids WHERE roundId = ? ORDER BY CAST(limitPrice AS REAL) DESC`).all(roundId);
    
    const formatted = bids.map((b: any) => ({
        user: b.userAddress,
        amount: parseFloat(b.amountUSDC),
        limitPrice: parseFloat(b.limitPrice),
        timestamp: b.timestamp,
        txHash: b.txHash
    }));
    res.json(formatted);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on http://0.0.0.0:${PORT}`));