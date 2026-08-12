/**
 * XMR Staking DApp 后端服务入口
 */
const express = require("express");
const cors = require("cors");
const config = require("./config/env");
const logger = require("./utils/logger");

// 路由
const generalRoutes = require("./routes/general");
const userRoutes = require("./routes/user");
const eventsRoutes = require("./routes/events");
const adminRoutes = require("./routes/admin");
const multisigRoutes = require("./routes/multisig");
const levelsRoutes = require("./routes/levels");

// 中间件
const {
  notFoundHandler,
  errorHandler,
} = require("./middleware/errorHandler");

// 服务
const eventScanner = require("./services/eventScanner");

// 创建 Express 应用
const app = express();

// ======================== 中间件 ========================

// CORS 跨域
app.use(cors());

// JSON 解析
app.use(express.json());

// URL 编码解析
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.originalUrl}`);
  next();
});

// ======================== 路由注册 ========================

app.use("/api", generalRoutes);
app.use("/api/user", userRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/multisig", multisigRoutes);
app.use("/api/levels", levelsRoutes);

// ======================== 错误处理 ========================

// 404
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

// ======================== 启动服务 ========================

const PORT = config.port;

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
