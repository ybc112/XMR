/**
 * 多签路由
 * /api/multisig/*
 */
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const blockchain = require("../services/blockchain");
const adminAuth = require("../middleware/adminAuth");
const { logAction } = require("../middleware/adminLogger");
const {
  asyncHandler,
  successResponse,
  errorResponse,
} = require("../middleware/errorHandler");
const { parsePagination, buildPagination } = require("../utils/formatter");

// ======================== 只读路由 ========================

/**
 * GET /api/multisig/owners - 获取多签所有者
 */
router.get(
  "/owners",
  asyncHandler(async (req, res) => {
    const [owners, required] = await Promise.all([
      blockchain.multisigContract.getOwners(),
      blockchain.multisigContract.required(),
    ]);
    res.json(
      successResponse({
        owners: owners,
        required: required.toString(),
        count: owners.length,
      })
    );
  })
);

/**
 * GET /api/multisig/transactions - 获取交易列表（分页）
 * query: page, limit, pending (bool), executed (bool)
 */
router.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const pending = req.query.pending === "true";
    const executed = req.query.executed === "true";

    // 获取符合条件的交易总数
    const totalCount = await blockchain.multisigContract.getTransactionCount(
      pending,
      executed
    );

    const total = Number(totalCount);
    const skip = (page - 1) * limit;
    const items = [];

    // 逐个获取交易详情（txId 从 0 开始）
    // 倒序排列（最新的在前）
    for (let i = total - 1 - skip; i >= 0 && items.length < limit; i--) {
      try {
        const tx = await blockchain.multisigContract.getTransaction(i);
        items.push({
          txId: i,
          to: tx.to,
          value: {
            raw: tx.value.toString(),
            formatted: ethers.formatEther(tx.value),
          },
          data: tx.data,
          executed: tx.executed,
          numConfirmations: tx.numConfirmations.toString(),
        });
      } catch (err) {
        // 跳过获取失败的交易
      }
    }

    res.json(successResponse(buildPagination(items, total, page, limit)));
  })
);

/**
 * GET /api/multisig/transaction/:txId - 获取单个交易详情
 */
router.get(
  "/transaction/:txId",
  asyncHandler(async (req, res) => {
    const txId = parseInt(req.params.txId, 10);
    if (isNaN(txId) || txId < 0) {
      return res.status(400).json(errorResponse("无效的交易ID"));
    }

    const tx = await blockchain.multisigContract.getTransaction(txId);
    res.json(
      successResponse({
        txId: txId,
        to: tx.to,
        value: {
          raw: tx.value.toString(),
          formatted: ethers.formatEther(tx.value),
        },
        data: tx.data,
        executed: tx.executed,
        numConfirmations: tx.numConfirmations.toString(),
      })
    );
  })
);

// ======================== 需要签名的路由（需要管理员认证） ========================

/**
 * POST /api/multisig/submit - 提交多签交易
 * body: { to: string, value: string, data: string }
 */
router.post(
  "/submit",
  adminAuth,
  asyncHandler(async (req, res) => {
    if (!blockchain.multisigContractWithSigner) {
      return res
        .status(503)
        .json(errorResponse("管理员钱包未配置，无法发送交易"));
    }

    const { to, value, data } = req.body;
    if (!to) {
      return res.status(400).json(errorResponse("缺少参数: to"));
    }

    const valueWei = value ? ethers.parseEther(String(value)) : 0n;
    const dataBytes = data ? data : "0x";

    const tx = await blockchain.multisigContractWithSigner.submitTransaction(
      to,
      valueWei,
      dataBytes
    );
    const receipt = await tx.wait();

    logAction(req, {
      action: "multisig-submit",
      target: to,
      detail: `value=${value || "0"}, data=${dataBytes}`,
      txHash: tx.hash,
    });

    res.json(
      successResponse(
        {
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status === 1 ? "success" : "failed",
        },
        "多签交易已提交"
      )
    );
  })
);

/**
 * POST /api/multisig/confirm/:txId - 确认交易
 */
router.post(
  "/confirm/:txId",
  adminAuth,
  asyncHandler(async (req, res) => {
    if (!blockchain.multisigContractWithSigner) {
      return res
        .status(503)
        .json(errorResponse("管理员钱包未配置，无法发送交易"));
    }

    const txId = parseInt(req.params.txId, 10);
    if (isNaN(txId) || txId < 0) {
      return res.status(400).json(errorResponse("无效的交易ID"));
    }

    const tx =
      await blockchain.multisigContractWithSigner.confirmTransaction(txId);
    const receipt = await tx.wait();

    logAction(req, {
      action: "multisig-confirm",
      target: String(txId),
      txHash: tx.hash,
    });

    res.json(
      successResponse(
        {
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status === 1 ? "success" : "failed",
        },
        `交易 ${txId} 已确认`
      )
    );
  })
);

/**
 * POST /api/multisig/revoke/:txId - 撤销确认
 */
router.post(
  "/revoke/:txId",
  adminAuth,
  asyncHandler(async (req, res) => {
    if (!blockchain.multisigContractWithSigner) {
      return res
        .status(503)
        .json(errorResponse("管理员钱包未配置，无法发送交易"));
    }

    const txId = parseInt(req.params.txId, 10);
    if (isNaN(txId) || txId < 0) {
      return res.status(400).json(errorResponse("无效的交易ID"));
    }

    const tx =
      await blockchain.multisigContractWithSigner.revokeConfirmation(txId);
    const receipt = await tx.wait();

    logAction(req, {
      action: "multisig-revoke",
      target: String(txId),
      txHash: tx.hash,
    });

    res.json(
      successResponse(
        {
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status === 1 ? "success" : "failed",
        },
        `交易 ${txId} 确认已撤销`
      )
    );
  })
);

/**
 * POST /api/multisig/execute/:txId - 执行交易
 */
router.post(
  "/execute/:txId",
  adminAuth,
  asyncHandler(async (req, res) => {
    if (!blockchain.multisigContractWithSigner) {
      return res
        .status(503)
        .json(errorResponse("管理员钱包未配置，无法发送交易"));
    }

    const txId = parseInt(req.params.txId, 10);
    if (isNaN(txId) || txId < 0) {
      return res.status(400).json(errorResponse("无效的交易ID"));
    }

    const tx =
      await blockchain.multisigContractWithSigner.executeTransaction(txId);
    const receipt = await tx.wait();

    logAction(req, {
      action: "multisig-execute",
      target: String(txId),
      txHash: tx.hash,
    });

    res.json(
      successResponse(
        {
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status === 1 ? "success" : "failed",
        },
        `交易 ${txId} 已执行`
      )
    );
  })
);

module.exports = router;
