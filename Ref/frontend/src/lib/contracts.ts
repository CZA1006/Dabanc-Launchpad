import { Abi, Address } from "viem";

// 合约地址配置 (通过环境变量或默认值)
export const SETTLEMENT_CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT || 
  "0x0000000000000000000000000000000000000000"
) as Address;

// 代币地址配置
export const TOKEN_ADDRESSES = {
  RWA: (process.env.NEXT_PUBLIC_RWA_TOKEN || "0x0000000000000000000000000000000000000000") as Address,
  GO: (process.env.NEXT_PUBLIC_GO_TOKEN || "0x0000000000000000000000000000000000000000") as Address,
} as const;

// 市场 ID (部署后更新)
export const MARKET_ID = (
  process.env.NEXT_PUBLIC_MARKET_ID || 
  "0x0000000000000000000000000000000000000000000000000000000000000000"
) as `0x${string}`;

// 从环境变量获取 RPC URL，支持局域网部署
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

// Anvil 本地链配置
export const ANVIL_CHAIN = {
  id: 31337,
  name: "Anvil Local",
  network: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
};

// OrderBookSettlement 合约 ABI
export const SETTLEMENT_ABI = [
  // 存款
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  // 提现
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  // 下单
  {
    type: "function",
    name: "placeOrder",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "isBuy", type: "bool" },
      { name: "price", type: "uint256" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "orderId", type: "bytes32" }],
    stateMutability: "nonpayable"
  },
  // 撤单
  {
    type: "function",
    name: "cancelOrder",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  // 查询余额
  {
    type: "function",
    name: "getBalance",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" }
    ],
    outputs: [
      { name: "available", type: "uint256" },
      { name: "locked", type: "uint256" }
    ],
    stateMutability: "view"
  },
  // 查询订单
  {
    type: "function",
    name: "getOrder",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "baseToken", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "price", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "filled", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "isBuy", type: "bool" },
          { name: "status", type: "uint8" }
        ]
      }
    ],
    stateMutability: "view"
  },
  // 查询市场
  {
    type: "function",
    name: "getMarket",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "baseToken", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "minOrderSize", type: "uint256" },
          { name: "tickSize", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" }
        ]
      }
    ],
    stateMutability: "view"
  },
  // 查询成交数
  {
    type: "function",
    name: "getTradesCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  // 查询最近成交
  {
    type: "function",
    name: "getRecentTrades",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "buyOrderId", type: "bytes32" },
          { name: "sellOrderId", type: "bytes32" },
          { name: "amount", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "timestamp", type: "uint256" }
        ]
      }
    ],
    stateMutability: "view"
  },
  // 事件
  {
    type: "event",
    name: "OrderPlaced",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "TradeExecuted",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "buyOrderId", type: "bytes32", indexed: false },
      { name: "sellOrderId", type: "bytes32", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "price", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }
    ]
  }
] as const satisfies Abi;

// ERC20 ABI
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view"
  }
] as const satisfies Abi;
