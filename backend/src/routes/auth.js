/**
 * 后台认证路由（无需 adminAuth，但受更严的速率限制保护）
 * /api/auth/*
 */
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../services/db");
const config = require("../config/env");
const logger = require("../utils/logger");
const {
  asyncHandler,
  successResponse,
  errorResponse,
} = require("../middleware/errorHandler");

/**
 * POST /api/auth/login - 管理后台登录
 * body: { username: string, password: string }
 * 返回: { token, username, role }
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res
        .status(400)
        .json(errorResponse("缺少参数: username, password"));
    }

    const user = db.findAdminUser(String(username).trim());
    const passwordOk =
      user && (await bcrypt.compare(String(password), user.password_hash));

    if (!passwordOk) {
      logger.warn(
        `[AUTH] 登录失败 - 用户: ${username}, IP: ${req.ip || "unknown"}`
      );
      return res.status(401).json(errorResponse("用户名或密码错误", 401));
    }

    // 签发 JWT（12 小时有效）
    const token = jwt.sign(
      { username: user.username, role: user.role || "admin" },
      config.adminJwtSecret,
      { expiresIn: "12h" }
    );

    logger.info(`[AUTH] 管理员登录成功: ${user.username}`);

    res.json(
      successResponse(
        {
          token,
          username: user.username,
          role: user.role || "admin",
        },
        "登录成功"
      )
    );
  })
);

module.exports = router;
