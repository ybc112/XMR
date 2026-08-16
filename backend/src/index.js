/**
 * XMR Staking DApp 后端服务入口
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("./config/env");
const logger = require("./utils/logger");
const db = require("./services/db");

// 路由
const generalRoutes = require("./routes/general");
const userRoutes = require("./routes/user");
const eventsRoutes = require("./routes/events");
const adminRoutes = require("./routes/admin");
const adminUsersRoutes = require("./routes/adminUsers");
const multisigRoutes = require("./routes/multisig");
const levelsRoutes = require("./routes/levels");
const authRoutes = require("./routes/auth");

// 中间件
const {
  notFoundHandler,
  errorHandler,
} = require("./middleware/errorHandler");

// 服务
const eventScanner = require("./services/eventScanner");

// 创建 Express 应用
const app = express();

// ======================== 安全中间件 ========================

// helmet 安全响应头（API 服务无需 CSP）
app.use(helmet({ contentSecurityPolicy: false }));

// CORS 跨域：配置了来源列表则严格限制，否则允许所有并打警告
if (config.corsOrigins && config.corsOrigins.trim()) {
  const origins = config.corsOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins }));
} else {
  logger.warn("未配置 CORS_ORIGINS，当前允许所有来源跨域访问，生产环境请务必配置");
  app.use(cors());
}

// JSON / URL 编码解析（限制请求体大小 1MB）
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 全局速率限制：15 分钟内最多 300 次请求/IP（健康检查跳过）
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/api/health",
});
app.use(globalLimiter);

// 登录接口更严格的速率限制：15 分钟内最多 10 次/IP（需挂在 auth 路由之前）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/login", loginLimiter);

// 请求日志
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.originalUrl}`);
  next();
});

// ======================== 路由注册 ========================

app.use("/api", generalRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminUsersRoutes);
app.use("/api/multisig", multisigRoutes);
app.use("/api/levels", levelsRoutes);

// ======================== 错误处理 ========================

// 404
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

// ======================== 启动服务 ========================

const PORT = config.port;

// 初始化引导管理员账号（admin_users 表为空时创建）
try {
  db.ensureBootstrap();
} catch (err) {
  logger.error("引导管理员账号初始化失败:", err.message);
}

const server = app.listen(PORT, () => {
  logger.info(`========================================`);
  logger.info(`XMR Staking DApp 后端服务已启动`);
  logger.info(`========================================`);
  logger.info(`端口: ${PORT}`);
  logger.info(`BSC RPC: ${config.bscRpcUrl}`);
  logger.info(`Staking合约: ${config.stakingContractAddress}`);
  logger.info(`XMR代币: ${config.xmrTokenAddress}`);
  logger.info(`多签钱包: ${config.multisigWalletAddress}`);
  logger.info(`USDT地址: ${config.usdtAddress}`);
  logger.info(`数据库: ${config.dbPath}`);
  logger.info(`========================================`);

  // 启动事件扫描服务
  try {
    eventScanner.start();
  } catch (err) {
    logger.error("事件扫描服务启动失败:", err.message);
  }
});

// 优雅退出
process.on("SIGTERM", () => {
  logger.info("收到 SIGTERM 信号，正在关闭服务...");
  eventScanner.stop();
  server.close(() => {
    logger.info("服务已关闭");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("收到 SIGINT 信号，正在关闭服务...");
  eventScanner.stop();
  server.close(() => {
    logger.info("服务已关闭");
    process.exit(0);
  });
});

// 未捕获异常处理
process.on("uncaughtException", (err) => {
  logger.error("未捕获的异常:", err.message);
  logger.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("未处理的 Promise 拒绝:", reason);
});

module.exports = app;
