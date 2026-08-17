/**
 * 区块链交互服务
 * 基于 ethers.js v6，提供只读和签名两种合约实例
 */
const { ethers } = require("ethers");
const config = require("../config/env");
const {
  STAKING_DAPP_ABI,
  XMR_TOKEN_ABI,
  MULTISIG_WALLET_ABI,
  USDT_ABI,
} = require("../config/abis");
const logger = require("../utils/logger");

// 创建 JsonRpcProvider（只读）
const provider = new ethers.JsonRpcProvider(config.bscRpcUrl, {
  chainId: config.chainId,
  name: config.chainId === 97 ? "bsc-testnet" : "bsc",
});

// 创建管理员 Wallet（签名），如果私钥配置了的话
let adminWallet = null;
if (
  config.adminPrivateKey &&
  config.adminPrivateKey !== "your_admin_private_key_here" &&
  config.adminPrivateKey !== ""
) {
  try {
    adminWallet = new ethers.Wallet(config.adminPrivateKey, provider);
    logger.info(
      `管理员钱包已加载: ${adminWallet.address}`
    );
  } catch (err) {
    logger.error("管理员私钥加载失败:", err.message);
  }
} else {
  logger.warn("未配置有效的管理员私钥，管理路由将无法发送交易");
}

// ======================== 只读合约实例 ========================

/** StakingDApp 只读合约 */
const stakingContract = new ethers.Contract(
  config.stakingContractAddress,
  STAKING_DAPP_ABI,
  provider
);

/** XMRToken 只读合约 */
const xmrTokenContract = new ethers.Contract(
  config.xmrTokenAddress,
  XMR_TOKEN_ABI,
  provider
);

/** MultiSigWallet 只读合约 */
const multisigContract = new ethers.Contract(
  config.multisigWalletAddress,
  MULTISIG_WALLET_ABI,
  provider
);

/** USDT 只读合约 */
const usdtContract = new ethers.Contract(
  config.usdtAddress,
  USDT_ABI,
  provider
);

// ======================== 签名合约实例 ========================

/** StakingDApp 签名合约（管理员） */
let stakingContractWithSigner = null;
if (adminWallet) {
  stakingContractWithSigner = stakingContract.connect(adminWallet);
}

/** MultiSigWallet 签名合约（管理员） */
let multisigContractWithSigner = null;
if (adminWallet) {
  multisigContractWithSigner = multisigContract.connect(adminWallet);
}

// ======================== 业务方法 ========================

/**
 * 获取合约全局统计
 */
async function getContractStats() {
  const stats = await stakingContract.getContractStats();
  return {
    totalUsers: stats.totalUsers.toString(),
    totalUSDTDeposited: {
      raw: stats.totalUSDTDeposited.toString(),
      formatted: ethers.formatEther(stats.totalUSDTDeposited),
    },
    xmrPrice: {
      raw: stats.xmrPrice.toString(),
      formatted: ethers.formatEther(stats.xmrPrice),
    },
    dailyRate: stats.dailyRate.toString(),
    computingPower: stats.computingPower.toString(),
    withdrawFee: stats.withdrawFee.toString(),
    paused: stats.paused,
    lastSettlementPeriod: (
      await stakingContract.lastSettlementPeriod()
    ).toString(),
    settlementInterval: (
      await stakingContract.SETTLEMENT_INTERVAL()
    ).toString(),
    contractUSDTBalance: {
      raw: stats.contractUSDTBalance.toString(),
      formatted: ethers.formatEther(stats.contractUSDTBalance),
    },
    contractXMRBalance: {
      raw: stats.contractXMRBalance.toString(),
      formatted: ethers.formatEther(stats.contractXMRBalance),
    },
  };
}

/**
 * 获取用户信息
 */
async function getUserInfo(address) {
  const info = await stakingContract.getUserInfo(address);
  return {
    address: ethers.getAddress(address),
    referrer: info.referrer,
    personalAmount: {
      raw: info.personalAmount.toString(),
      formatted: ethers.formatEther(info.personalAmount),
    },
    totalEarned: {
      raw: info.totalEarned.toString(),
      formatted: ethers.formatEther(info.totalEarned),
    },
    exitLimit: {
      raw: info.exitLimit.toString(),
      formatted: ethers.formatEther(info.exitLimit),
    },
    isBlacklisted: info.isBlacklisted,
    isRegistered: info.isRegistered,
    exited: info.exited,
    level: Number(info.level), // 后端 ABI 中 level 为 uint256，需转 number 否则 JSON 序列化失败
    pendingUSDT: {
      raw: info.pendingUSDT.toString(),
      formatted: ethers.formatEther(info.pendingUSDT),
    },
    pendingXMR: {
      raw: info.pendingXMR.toString(),
      formatted: ethers.formatEther(info.pendingXMR),
    },
    teamTotalVolume: {
      raw: info.teamTotalVolume.toString(),
      formatted: ethers.formatEther(info.teamTotalVolume),
    },
    maxAreaVolume: {
      raw: info.maxAreaVolume.toString(),
      formatted: ethers.formatEther(info.maxAreaVolume),
    },
    memberId: info.memberId.toString(),
    xmrWithdrawalPending: {
      raw: info.xmrWithdrawalPending.toString(),
      formatted: ethers.formatEther(info.xmrWithdrawalPending),
    },
  };
}

/**
 * 获取直推列表
 */
async function getDirectReferrals(address) {
  const [referrals, count] = await Promise.all([
    stakingContract.getDirectReferrals(address),
    stakingContract.getDirectReferralCount(address),
  ]);
  return {
    count: count.toString(),
    referrals: referrals.map((addr) => addr),
  };
}

/**
 * 获取静态收益预估
 */
async function estimateStaticReward(address) {
  const [usdtValue, xmrValue] = await stakingContract.estimateStaticReward(
    address
  );
  return {
    usdtValue: {
      raw: usdtValue.toString(),
      formatted: ethers.formatEther(usdtValue),
    },
    xmrValue: {
      raw: xmrValue.toString(),
      formatted: ethers.formatEther(xmrValue),
    },
  };
}

/**
 * 获取剩余出局额度
 */
async function getRemainingExitLimit(address) {
  const limit = await stakingContract.getRemainingExitLimit(address);
  return {
    raw: limit.toString(),
    formatted: ethers.formatEther(limit),
  };
}

/**
 * 获取子区业绩
 */
async function getSubAreaVolume(address) {
  const volume = await stakingContract.getSubAreaVolume(address);
  return {
    raw: volume.toString(),
    formatted: ethers.formatEther(volume),
  };
}

/**
 * 获取等级信息
 */
async function getLevelInfo(level) {
  const [threshold, rewardRate, maxReward] =
    await stakingContract.getLevelInfo(level);
  return {
    level: level,
    threshold: {
      raw: threshold.toString(),
      formatted: ethers.formatEther(threshold),
    },
    rewardRate: rewardRate.toString(),
    maxReward: {
      raw: maxReward.toString(),
      formatted: ethers.formatEther(maxReward),
    },
  };
}

/**
 * 获取所有等级信息 (M1-M9, 即 level 1-9)
 */
async function getAllLevels() {
  const levels = [];
  for (let i = 1; i <= 9; i++) {
    try {
      const info = await getLevelInfo(i);
      levels.push(info);
    } catch (err) {
      logger.warn(`获取等级 ${i} 信息失败:`, err.message);
    }
  }
  return levels;
}

/**
 * 获取当前XMR价格
 */
async function getXMRPrice() {
  const stats = await stakingContract.getContractStats();
  return {
    raw: stats.xmrPrice.toString(),
    formatted: ethers.formatEther(stats.xmrPrice),
  };
}

/**
 * 发送管理员交易并等待确认
 * @param {Function} txFn - 返回未签名交易的函数
 * @returns {object} 交易回执信息
 */
async function sendAdminTransaction(txFn) {
  if (!stakingContractWithSigner) {
    throw new Error("管理员钱包未配置，无法发送交易");
  }

  const tx = await txFn();
  logger.info(`交易已发送: ${tx.hash}`);

  const receipt = await tx.wait();
  logger.info(
    `交易已确认: ${tx.hash}, 区块: ${receipt.blockNumber}, 状态: ${receipt.status === 1 ? "成功" : "失败"}`
  );

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === 1 ? "success" : "failed",
    events:
      receipt.logs && receipt.logs.length > 0
        ? receipt.logs.length
        : 0,
  };
}

module.exports = {
  provider,
  adminWallet,
  stakingContract,
  stakingContractWithSigner,
  xmrTokenContract,
  multisigContract,
  multisigContractWithSigner,
  usdtContract,
  // 业务方法
  getContractStats,
  getUserInfo,
  getDirectReferrals,
  estimateStaticReward,
  getRemainingExitLimit,
  getSubAreaVolume,
  getLevelInfo,
  getAllLevels,
  getXMRPrice,
  sendAdminTransaction,
};
