/**
 * 错误处理中间件
 * 统一错误响应格式
 */
const logger = require("../utils/logger");

/**
 * 统一成功响应
 */
function successResponse(data, message) {
  return {
    success: true,
    data: data,
    message: message || null,
    error: null,
  };
}

/**
 * 统一错误响应
 */
function errorResponse(error, code) {
  return {
    success: false,
    data: null,
    message: typeof error === "string" ? error : error.message || "Internal Server Error",
    error: typeof error === "string" ? error : error.message || "Internal Server Error",
  };
}

/**
 * 异步路由包装器，自动捕获 Promise 错误
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 处理
 */
function notFoundHandler(req, res) {
  res.status(404).json(errorResponse("接口不存在", 404));
}

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
  // 不要在这里调用 next
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`);

  // ethers 合约 revert 错误
  if (err.reason) {
    return res.status(400).json({
      success: false,
      data: null,
      message: `合约错误: ${err.reason}`,
      error: err.reason,
    });
  }

  // ethers CALL_EXCEPTION
  if (err.code === "CALL_EXCEPTION") {
    return res.status(400).json({
      success: false,
      data: null,
      message: `合约调用异常: ${err.shortMessage || err.message}`,
      error: err.shortMessage || err.message,
    });
  }

  // 网络错误
  if (err.code === "NETWORK_ERROR" || err.code === "SERVER_ERROR") {
    return res.status(503).json({
      success: false,
      data: null,
      message: "区块链网络错误，请稍后重试",
      error: err.message,
    });
  }

  // 默认 500 错误
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    data: null,
    message: err.message || "服务器内部错误",
    error: err.message || "Internal Server Error",
  });
}

module.exports = {
  successResponse,
  errorResponse,
  asyncHandler,
  notFoundHandler,
  errorHandler,
};
