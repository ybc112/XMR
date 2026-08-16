/**
 * 管理操作日志中间件
 * 在管理操作成功后调用 logAction，将操作写入 admin_logs 表
 */
const db = require("../services/db");
const logger = require("../utils/logger");

/**
 * 记录管理操作日志
 * @param {object} req - Express 请求对象（取 req.adminUser.username 与 req.ip）
 * @param {object} options
 * @param {string} options.action - 操作名（如 set-xmr-price）
 * @param {*} options.target - 操作目标（用户/价格/费率等）
 * @param {*} options.detail - 详细说明
 * @param {string} options.txHash - 关联链上交易哈希
 */
function logAction(req, { action, target = null, detail = null, txHash = null } = {}) {
  try {
    db.insertAdminLog({
      username: (req && req.adminUser && req.adminUser.username) || "unknown",
      action: action || "unknown",
      target,
      detail,
      txHash,
      ip: (req && req.ip) || null,
    });
  } catch (err) {
    // 日志写入失败不影响主流程
    logger.warn(`记录管理操作日志失败: ${err.message}`);
  }
}

module.exports = { logAction };
