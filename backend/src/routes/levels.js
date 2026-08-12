/**
 * 等级路由
 * /api/levels/all, /api/levels/:level
 */
const express = require("express");
const router = express.Router();
const blockchain = require("../services/blockchain");
const {
  asyncHandler,
  successResponse,
  errorResponse,
} = require("../middleware/errorHandler");

/**
 * GET /api/levels/all - 获取所有等级信息 (M1-M9)
 */
router.get(
  "/all",
  asyncHandler(async (req, res) => {
    const levels = await blockchain.getAllLevels();
    res.json(successResponse(levels));
  })
);

/**
 * GET /api/levels/:level - 获取单个等级信息
 */
router.get(
  "/:level",
  asyncHandler(async (req, res) => {
    const level = parseInt(req.params.level, 10);

    if (isNaN(level) || level < 1 || level > 9) {
      return res
        .status(400)
        .json(errorResponse("等级必须在 1-9 之间"));
    }

    const info = await blockchain.getLevelInfo(level);
    res.json(successResponse(info));
  })
);

module.exports = router;
