/**
 * 环境变量配置
 * 加载并校验所有必需的环境变量
 */
require("dotenv").config();
const path = require("path");

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

  // 管理员API密钥（必填，无默认值）
  adminApiKey: required("ADMIN_API_KEY"),

  // 管理后台 JWT 密钥（必填，无默认值）
  adminJwtSecret: required("ADMIN_JWT_SECRET"),

  // 引导管理员账号（首次启动时若 admin_users 表为空则创建）
  bootstrapAdminUsername: required("ADMIN_USERNAME"),
  bootstrapAdminPassword: required("ADMIN_PASSWORD"),

  // SQLite 数据库文件路径（默认 backend 同级 data/xmr.db）
  dbPath: required("DB_PATH", path.join(__dirname, "..", "..", "data", "xmr.db")),

  // CORS 允许的来源（逗号分隔，空 = 允许所有，启动时会打警告）
  corsOrigins: required("CORS_ORIGINS", ""),

  // 事件扫描配置
  startBlock: parseInt(required("START_BLOCK", "0"), 10),
  scanInterval: parseInt(required("SCAN_INTERVAL", "15000"), 10),
  // 50 块兼容所有公共 RPC 节点（1rpc 限 50 块、dataseed 范围限制、publicnode 限流）
  scanBatchSize: parseInt(required("SCAN_BATCH_SIZE", "50"), 10),

  // 自动结算调度（正式环境：每日北京时间 12:01 自动结算一次）
  // settlementIntervalMinutes 保留仅为兼容旧配置，实际调度已固定对齐北京 12:01
  settlementEnabled: required("SETTLEMENT_ENABLED", "true") === "true",
  settlementIntervalMinutes: parseInt(
    required("SETTLEMENT_INTERVAL_MINUTES", "1440"),
    10
  ),
  settlementPriceUrl: required("SETTLEMENT_PRICE_URL", ""),
};

module.exports = config;
