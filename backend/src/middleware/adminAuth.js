/**
 * 管理员认证中间件
 * 检查请求头中的 admin-key 是否与环境变量中的 ADMIN_API_KEY 匹配
 */
const config = require("../config/env");
const logger = require("../utils/logger");
const { errorResponse } = require("./errorHandler");

/**
 * 管理员认证中间件
 * 检查请求头 x-admin-key 或 admin-key
 */
function adminAuth(req, res, next) {
  const adminKey =
    req.headers["x-admin-key"] ||
    req.headers["admin-key"] ||
    req.query.adminKey;

  if (!adminKey) {
    logger.warn(
      `[ADMIN AUTH] 未提供管理员密钥 - ${req.method} ${req.originalUrl}`
    );
    return res
      .status(401)
      .json(errorResponse("未提供管理员密钥", 401));
  }

  if (adminKey !== config.adminApiKey) {
    logger.warn(
      `[ADMIN AUTH] 管理员密钥无效 - ${req.method} ${req.originalUrl}`
    );
    return res
      .status(403)
      .json(errorResponse("管理员密钥无效", 403));
  }

  next();
}

module.exports = adminAuth;
