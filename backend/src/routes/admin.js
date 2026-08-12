/**
 * 管理路由 (需要管理员权限)
 * /api/admin/*
 */
const express = require("express");
const router = express.Router();
const blockchain = require("../services/blockchain");
const cache = require("../services/cache");
const adminAuth = require("../middleware/adminAuth");
const {
  asyncHandler,
  successResponse,
  errorResponse,
} = require("../middleware/errorHandler");
const { parsePagination, buildPagination } = require("../utils/formatter");

// 所有管理路由都需要管理员认证
router.use(adminAuth);

/**
 * POST /api/admin/set-xmr-price - 设置XMR价格
 * body: { price: string }  (ether 字符串，如 "1.5")
 */
router.post(
  "/set-xmr-price",
  asyncHandler(async (req, res) => {
    const { price } = req.body;
    if (!price) {
      return res.status(400).json(errorResponse("缺少参数: price"));
    }

    const { ethers } = require("ethers");
    const priceWei = ethers.parseEther(String(price));

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.setXMRPrice(priceWei)
    );
    res.json(successResponse(result, "XMR价格已更新"));
  })
);

/**
 * POST /api/admin/daily-settlement - 每日结算
 * body: { xmrPrice: string }  (ether 字符串)
 */
router.post(
  "/daily-settlement",
  asyncHandler(async (req, res) => {
    const { xmrPrice } = req.body;
    if (!xmrPrice) {
      return res.status(400).json(errorResponse("缺少参数: xmrPrice"));
    }

    const { ethers } = require("ethers");
    const priceWei = ethers.parseEther(String(xmrPrice));

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.dailySettlement(priceWei)
    );
    res.json(successResponse(result, "每日结算已完成"));
  })
);

/**
 * POST /api/admin/set-daily-rate - 设置日化率
 * body: { rate: number }
 */
router.post(
  "/set-daily-rate",
  asyncHandler(async (req, res) => {
    const { rate } = req.body;
    if (rate === undefined || rate === null) {
      return res.status(400).json(errorResponse("缺少参数: rate"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.setDailyRate(BigInt(rate))
    );
    res.json(successResponse(result, "日化率已更新"));
  })
);

/**
 * POST /api/admin/set-computing-power - 设置算力
 * body: { power: number }
 */
router.post(
  "/set-computing-power",
  asyncHandler(async (req, res) => {
    const { power } = req.body;
    if (power === undefined || power === null) {
      return res.status(400).json(errorResponse("缺少参数: power"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.setComputingPower(BigInt(power))
    );
    res.json(successResponse(result, "算力已更新"));
  })
);

/**
 * POST /api/admin/set-withdraw-fee - 设置提现费率
 * body: { fee: number }
 */
router.post(
  "/set-withdraw-fee",
  asyncHandler(async (req, res) => {
    const { fee } = req.body;
    if (fee === undefined || fee === null) {
      return res.status(400).json(errorResponse("缺少参数: fee"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.setWithdrawFee(BigInt(fee))
    );
    res.json(successResponse(result, "提现费率已更新"));
  })
);

/**
 * POST /api/admin/set-blacklist - 设置黑名单
 * body: { user: string, status: boolean }
 */
router.post(
  "/set-blacklist",
  asyncHandler(async (req, res) => {
    const { user, status } = req.body;
    if (!user || status === undefined) {
      return res
        .status(400)
        .json(errorResponse("缺少参数: user, status"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.setBlacklist(user, status)
    );
    res.json(
      successResponse(result, `用户 ${user} 黑名单状态已设置为 ${status}`)
    );
  })
);

/**
 * POST /api/admin/emergency-pause - 紧急暂停
 */
router.post(
  "/emergency-pause",
  asyncHandler(async (req, res) => {
    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.emergencyPause()
    );
    res.json(successResponse(result, "合约已紧急暂停"));
  })
);

/**
 * POST /api/admin/emergency-unpause - 紧急恢复
 */
router.post(
  "/emergency-unpause",
  asyncHandler(async (req, res) => {
    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.emergencyUnpause()
    );
    res.json(successResponse(result, "合约已恢复"));
  })
);

/**
 * POST /api/admin/add-admin - 添加管理员
 * body: { admin: string }
 */
router.post(
  "/add-admin",
  asyncHandler(async (req, res) => {
    const { admin } = req.body;
    if (!admin) {
      return res.status(400).json(errorResponse("缺少参数: admin"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.addAdmin(admin)
    );
    res.json(successResponse(result, `管理员 ${admin} 已添加`));
  })
);

/**
 * POST /api/admin/remove-admin - 移除管理员
 * body: { admin: string }
 */
router.post(
  "/remove-admin",
  asyncHandler(async (req, res) => {
    const { admin } = req.body;
    if (!admin) {
      return res.status(400).json(errorResponse("缺少参数: admin"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.removeAdmin(admin)
    );
    res.json(successResponse(result, `管理员 ${admin} 已移除`));
  })
);

/**
 * POST /api/admin/process-xmr-withdrawal - 处理XMR提现
 * body: { user: string }
 */
router.post(
  "/process-xmr-withdrawal",
  asyncHandler(async (req, res) => {
    const { user } = req.body;
    if (!user) {
      return res.status(400).json(errorResponse("缺少参数: user"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.processXMRWithdrawal(user)
    );
    res.json(successResponse(result, `用户 ${user} 的XMR提现已处理`));
  })
);

/**
 * GET /api/admin/pending-xmr-withdrawals - 获取待处理的XMR提现列表
 */
router.get(
  "/pending-xmr-withdrawals",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const result = cache.getPendingXMRWithdrawals(page, limit);
    res.json(
      successResponse(buildPagination(result.items, result.total, page, limit))
    );
  })
);

module.exports = router;
