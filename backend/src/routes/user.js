/**
 * 用户路由
 * /api/user/:address, /api/user/:address/referrals, etc.
 */
const express = require("express");
const router = express.Router();
const blockchain = require("../services/blockchain");
const cache = require("../services/cache");
const {
  asyncHandler,
  successResponse,
} = require("../middleware/errorHandler");
const { parsePagination, buildPagination } = require("../utils/formatter");

/**
 * GET /api/user/:address - 获取用户信息
 */
router.get(
  "/:address",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const info = await blockchain.getUserInfo(address);
    res.json(successResponse(info));
  })
);

/**
 * GET /api/user/:address/referrals - 获取直推列表
 */
router.get(
  "/:address/referrals",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const data = await blockchain.getDirectReferrals(address);
    res.json(successResponse(data));
  })
);

/**
 * GET /api/user/:address/rewards-estimate - 获取静态收益预估
 */
router.get(
  "/:address/rewards-estimate",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const estimate = await blockchain.estimateStaticReward(address);
    res.json(successResponse(estimate));
  })
);

/**
 * GET /api/user/:address/exit-limit - 获取剩余出局额度
 */
router.get(
  "/:address/exit-limit",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const limit = await blockchain.getRemainingExitLimit(address);
    res.json(successResponse(limit));
  })
);

/**
 * GET /api/user/:address/sub-area-volume - 获取子区业绩
 */
router.get(
  "/:address/sub-area-volume",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const volume = await blockchain.getSubAreaVolume(address);
    res.json(successResponse(volume));
  })
);

/**
 * GET /api/user/:address/events - 获取用户相关的事件
 */
router.get(
  "/:address/events",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    const { page, limit } = parsePagination(req.query);
    const result = cache.getEventsByAddress(address, page, limit);
    res.json(
      successResponse(buildPagination(result.items, result.total, page, limit))
    );
  })
);

module.exports = router;
