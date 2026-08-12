/**
 * 通用路由
 * /api/health, /api/contract-stats, /api/xmr-price
 */
const express = require("express");
const router = express.Router();
const blockchain = require("../services/blockchain");
const eventScanner = require("../services/eventScanner");
const {
  asyncHandler,
  successResponse,
} = require("../middleware/errorHandler");

/**
 * GET /api/health - 健康检查
 */
router.get(
  "/health",
  asyncHandler(async (req, res) => {
    res.json(
      successResponse({
        status: "ok",
        timestamp: new Date().toISOString(),
        scanner: eventScanner.getStatus(),
      })
    );
  })
);

/**
 * GET /api/contract-stats - 合约全局统计
 */
router.get(
  "/contract-stats",
  asyncHandler(async (req, res) => {
    const stats = await blockchain.getContractStats();
    res.json(successResponse(stats));
  })
);

/**
 * GET /api/xmr-price - 获取当前XMR价格
 */
router.get(
  "/xmr-price",
  asyncHandler(async (req, res) => {
    const price = await blockchain.getXMRPrice();
    res.json(successResponse(price));
  })
);

module.exports = router;
