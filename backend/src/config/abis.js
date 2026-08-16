/**
 * 合约ABI定义
 * 包含 StakingDApp、XMRToken、MultiSigWallet 三个合约的ABI
 */

// ======================== StakingDApp 合约ABI ========================
const STAKING_DAPP_ABI = [
  // -------- 用户操作 --------
  {
    inputs: [{ name: "_referrer", type: "address" }],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_amount", type: "uint256" }],
    name: "invest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "claimStaticReward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_xmrAmount", type: "uint256" }],
    name: "flashExchange",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_amount", type: "uint256" }],
    name: "withdrawUSDT",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_amount", type: "uint256" }],
    name: "requestXMRWithdrawal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_addr", type: "string" }],
    name: "setXMRAddress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // -------- 查询函数 --------
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "getUserInfo",
    outputs: [
      {
        components: [
          { name: "referrer", type: "address" },
          { name: "personalAmount", type: "uint256" },
          { name: "totalEarned", type: "uint256" },
          { name: "exitLimit", type: "uint256" },
          { name: "isBlacklisted", type: "bool" },
          { name: "isRegistered", type: "bool" },
          { name: "exited", type: "bool" },
          { name: "level", type: "uint8" },
          { name: "pendingUSDT", type: "uint256" },
          { name: "pendingXMR", type: "uint256" },
          { name: "teamTotalVolume", type: "uint256" },
          { name: "maxAreaVolume", type: "uint256" },
          { name: "memberId", type: "uint256" },
          { name: "xmrWithdrawalPending", type: "uint256" },
          { name: "xmrAddress", type: "string" },
        ],
        name: "userInfo",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "xmrAddress",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "userComputingPower",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getContractStats",
    outputs: [
      {
        components: [
          { name: "totalUsers", type: "uint256" },
          { name: "totalUSDTDeposited", type: "uint256" },
          { name: "xmrPrice", type: "uint256" },
          { name: "dailyRate", type: "uint256" },
          { name: "computingPower", type: "uint256" },
          { name: "withdrawFee", type: "uint256" },
          { name: "paused", type: "bool" },
          { name: "contractUSDTBalance", type: "uint256" },
          { name: "contractXMRBalance", type: "uint256" },
        ],
        name: "stats",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "getDirectReferrals",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "getDirectReferralCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "getRemainingExitLimit",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "getSubAreaVolume",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "estimateStaticReward",
    outputs: [
      { name: "usdtValue", type: "uint256" },
      { name: "xmrValue", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_level", type: "uint8" }],
    name: "getLevelInfo",
    outputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },

  // -------- 管理函数 --------
  {
    inputs: [{ name: "_xmrPrice", type: "uint256" }],
    name: "setXMRPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_xmrPrice", type: "uint256" }],
    name: "dailySettlement",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_user", type: "address" }],
    name: "processXMRWithdrawal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_rate", type: "uint256" }],
    name: "setDailyRate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_power", type: "uint256" }],
    name: "setComputingPower",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "_user", type: "address" },
      { name: "_power", type: "uint256" },
    ],
    name: "setUserComputingPower",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "_user", type: "address" },
      { name: "_delta", type: "int256" },
    ],
    name: "adjustUserUSDT",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "_user", type: "address" },
      { name: "_delta", type: "int256" },
    ],
    name: "adjustUserXMR",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_fee", type: "uint256" }],
    name: "setWithdrawFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "_user", type: "address" },
      { name: "_status", type: "bool" },
    ],
    name: "setBlacklist",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "emergencyPause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "emergencyUnpause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_admin", type: "address" }],
    name: "addAdmin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_admin", type: "address" }],
    name: "removeAdmin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // -------- 事件 --------
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "referrer", type: "address" },
      { indexed: false, name: "memberId", type: "uint256" },
    ],
    name: "Registered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "totalPersonal", type: "uint256" },
    ],
    name: "Invested",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "usdtValue", type: "uint256" },
      { indexed: false, name: "xmrAmount", type: "uint256" },
    ],
    name: "StaticRewardClaimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "receiver", type: "address" },
      { indexed: true, name: "investor", type: "address" },
      { indexed: false, name: "generation", type: "uint8" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "GenerationReward",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "receiver", type: "address" },
      { indexed: true, name: "investor", type: "address" },
      { indexed: false, name: "level", type: "uint8" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "TeamReward",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "totalEarned", type: "uint256" },
    ],
    name: "Exited",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
    ],
    name: "USDTWithdrawn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "fee", type: "uint256" },
      { indexed: false, name: "xmrAddr", type: "string" },
    ],
    name: "XMRWithdrawalRequested",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "XMRWithdrawalProcessed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "xmrAddr", type: "string" },
    ],
    name: "XMRAddressSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "power", type: "uint256" },
    ],
    name: "UserComputingPowerSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "kind", type: "string" },
      { indexed: false, name: "delta", type: "int256" },
      { indexed: false, name: "operator", type: "address" },
    ],
    name: "BalanceAdjusted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "xmrAmount", type: "uint256" },
      { indexed: false, name: "usdtAmount", type: "uint256" },
    ],
    name: "FlashExchanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "day", type: "uint256" },
      { indexed: false, name: "xmrPrice", type: "uint256" },
    ],
    name: "DailySettlement",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "status", type: "bool" },
    ],
    name: "BlacklistUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [],
    name: "Paused",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [],
    name: "Unpaused",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "admin", type: "address" },
      { indexed: false, name: "status", type: "bool" },
    ],
    name: "AdminUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "oldRate", type: "uint256" },
      { indexed: false, name: "newRate", type: "uint256" },
    ],
    name: "DailyRateUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "oldPower", type: "uint256" },
      { indexed: false, name: "newPower", type: "uint256" },
    ],
    name: "ComputingPowerUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "oldPrice", type: "uint256" },
      { indexed: false, name: "newPrice", type: "uint256" },
    ],
    name: "XMRPriceUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "oldLevel", type: "uint8" },
      { indexed: false, name: "newLevel", type: "uint8" },
    ],
    name: "LevelUpdated",
    type: "event",
  },
];

// ======================== XMRToken 合约ABI ========================
const XMR_TOKEN_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "minter",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_SUPPLY",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
];

// ======================== MultiSigWallet 合约ABI ========================
const MULTISIG_WALLET_ABI = [
  {
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_data", type: "bytes" },
    ],
    name: "submitTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_txId", type: "uint256" }],
    name: "confirmTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_txId", type: "uint256" }],
    name: "revokeConfirmation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_txId", type: "uint256" }],
    name: "executeTransaction",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getOwners",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "pending", type: "bool" },
      { name: "executed", type: "bool" },
    ],
    name: "getTransactionCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "_txId", type: "uint256" }],
    name: "getTransaction",
    outputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "executed", type: "bool" },
      { name: "numConfirmations", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "isOwner",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "required",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "transactionCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // 事件
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "txId", type: "uint256" },
      { indexed: false, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
      { indexed: false, name: "data", type: "bytes" },
    ],
    name: "SubmitTransaction",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "txId", type: "uint256" },
    ],
    name: "ConfirmTransaction",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "txId", type: "uint256" },
    ],
    name: "RevokeConfirmation",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "txId", type: "uint256" },
    ],
    name: "ExecuteTransaction",
    type: "event",
  },
];

// USDT ABI (BSC上的USDT，18位小数)
const USDT_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

module.exports = {
  STAKING_DAPP_ABI,
  XMR_TOKEN_ABI,
  MULTISIG_WALLET_ABI,
  USDT_ABI,
};
