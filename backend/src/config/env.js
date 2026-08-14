/**
 * 环境变量配置
 * 加载并校验所有必需的环境变量
 */
require("dotenv").config();

const required = (key, defaultValue) => {
  const value = process.env[key];
  if (value === undefined || value === "") {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`缺少必需的环境变量: ${key}`);
  }
  return value;
};

const config = {
  // 服务端口
  port: parseInt(required("PORT", "3001"), 10),

  // BSC RPC
  bscRpcUrl: required("BSC_RPC_URL", "https://bsc-dataseed.binance.org"),
  // 链 ID：56 主网 / 97 测试网
  chainId: parseInt(required("CHAIN_ID", "56"), 10),

  // 合约地址
  stakingContractAddress: required("STAKING_CONTRACT_ADDRESS"),
  xmrTokenAddress: required("XMR_TOKEN_ADDRESS"),
  multisigWalletAddress: required("MULTISIG_WALLET_ADDRESS"),
  usdtAddress: required(
    "USDT_ADDRESS",
    "0x55d398326f99059fF775485246999027B3197955"
  ),

  // 管理员私钥
  adminPrivateKey: required("ADMIN_PRIVATE_KEY", ""),

  // 管理员API密钥
  adminApiKey: required("ADMIN_API_KEY", "default-admin-key-change-me"),

  // 事件扫描配置
  startBlock: parseInt(required("START_BLOCK", "0"), 10),
  scanInterval: parseInt(required("SCAN_INTERVAL", "15000"), 10),
  scanBatchSize: parseInt(required("SCAN_BATCH_SIZE", "2000"), 10),
};

module.exports = config;
