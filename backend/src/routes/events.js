/**
 * 事件路由
 * /api/events/investments, /api/events/rewards, etc.
 */
const express = require("express");
const router = express.Router();
const cache = require("../services/cache");
const {
  asyncHandler,
  successResponse,
} = require("../middleware/errorHandler");
const { parsePagination, buildPagination } = require("../utils/formatter");

/**
 * 通用分页事件查询
 */
function getPaginatedEvents(category, req, res) {
  const { page, limit } = parsePagination(req.query);
  const result = cache.getEvents(category, page, limit);
  return res.json(
    successResponse(buildPagination(result.items, result.total, page, limit))
  );
}

/**
 * GET /api/events/investments - 投资事件列表（分页）
 */
router.get(
  "/investments",
  asyncHandler(async (req, res) => {
    getPaginatedEvents("investments", req, res);
  })
);

/**
 * GET /api/events/rewards - 奖励事件列表（分页）
 */
router.get(
  "/rewards",
  asyncHandler(async (req, res) => {
    getPaginatedEvents("rewards", req, res);
  })
);

/**
 * GET /api/events/withdrawals - 提现事件列表（分页）
 */
router.get(
  "/withdrawals",
  asyncHandler(async (req, res) => {
    getPaginatedEvents("withdrawals", req, res);
  })
);

/**
 * GET /api/events/registrations - 注册事件列表（分页）
 */
router.get(
  "/registrations",
  asyncHandler(async (req, res) => {
    getPaginatedEvents("registrations", req, res);
  })
);

/**
 * GET /api/events/flash-exchanges - 闪兑事件列表（分页）
 */
router.get(
  "/flash-exchanges",
  asyncHandler(async (req, res) => {
    getPaginatedEvents("flashExchanges", req, res);
  })
);

/**
 * GET /api/events/all - 所有事件（分页，按时间倒序）
 */
router.get(
  "/all",
  asyncHandler(async (req, res) => {
    getPaginatedEvents("all", req, res);
  })
);

module.exports = router;
