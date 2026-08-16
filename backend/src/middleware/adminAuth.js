/**
 * 管理员认证中间件
 * 支持两种认证方式：
 *   ① Authorization: Bearer <jwt>（独立后台管理系统登录令牌）
 *   ② 请求头 x-admin-key 或 admin-key（兼容 DApp 内嵌 Admin 页）
 * 注意：不再支持 req.query.adminKey（安全要求）
 */
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const logger = require("../utils/logger");
const { errorResponse } = require("./errorHandler");

/**
 * 管理员认证中间件
 * 未提供凭证返回 401；凭证无效返回 403
 */
function adminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const adminKey = req.headers["x-admin-key"] || req.headers["admin-key"];

  // 未提供任何凭证
  if (!authHeader && !adminKey) {
    logger.warn(
      `[ADMIN AUTH] 未提供管理员凭证 - ${req.method} ${req.originalUrl}`
    );
    return res
      .status(401)
      .json(errorResponse("未提供管理员凭证", 401));
  }

  // ① Bearer JWT
  if (authHeader) {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      logger.warn(
        `[ADMIN AUTH] Authorization 头格式错误 - ${req.method} ${req.originalUrl}`
      );
      return res.status(403).json(errorResponse("认证凭证无效", 403));
    }

    try {
      const payload = jwt.verify(token, config.adminJwtSecret);
      req.adminUser = {
        username: payload.username,
        role: payload.role || "admin",
      };
      return next();
    } catch (err) {
      logger.warn(
        `[ADMIN AUTH] JWT 无效或已过期 - ${req.method} ${req.originalUrl} - ${err.message}`
      );
      return res
        .status(403)
        .json(errorResponse("访问凭证无效或已过期", 403));
    }
  }

  // ② API Key（x-admin-key / admin-key）
  if (adminKey !== config.adminApiKey) {
    logger.warn(
      `[ADMIN AUTH] 管理员密钥无效 - ${req.method} ${req.originalUrl}`
    );
    return res
      .status(403)
      .json(errorResponse("管理员密钥无效", 403));
  }

  req.adminUser = { username: "api-key", role: "admin" };
  next();
}

module.exports = adminAuth;
