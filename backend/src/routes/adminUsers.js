/**
 * 独立后台管理系统路由（D1）
 * /api/admin/stats、/api/admin/users/*、/api/admin/logs
 * 全部需要管理员认证（JWT 或 API Key），全部走 asyncHandler
 */
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const blockchain = require("../services/blockchain");
const db = require("../services/db");
const config = require("../config/env");
const adminAuth = require("../middleware/adminAuth");
const { logAction } = require("../middleware/adminLogger");
const {
  asyncHandler,
  successResponse,
  errorResponse,
} = require("../middleware/errorHandler");
const { parsePagination, buildPagination } = require("../utils/formatter");

// 所有路由需要管理员认证
router.use(adminAuth);

// ======================== 辅助函数 ========================

/**
 * 并发映射（每批 batch 个，避免 RPC 压力过大；单项失败返回 null 不影响整体）
 */
async function mapInBatches(items, batch, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batch) {
    const chunk = items.slice(i, i + batch);
    const part = await Promise.all(
      chunk.map(async (item) => {
        try {
          return await fn(item);
        } catch {
          return null;
        }
      })
    );
    results.push(...part);
  }
  return results;
}

/** 获取用户算力（字符串，0 表示跟随全局） */
async function getUserComputingPower(address) {
  try {
    const power = await blockchain.stakingContract.userComputingPower(address);
    return power.toString();
  } catch {
    return null;
  }
}

/** 校验并规范化地址参数；无效时直接响应 400 并返回 null */
function resolveAddress(req, res) {
  const { address } = req.params;
  if (!ethers.isAddress(address)) {
    res.status(400).json(errorResponse("无效的地址"));
    return null;
  }
  return ethers.getAddress(address);
}

/** 由注册事件行 + 链上 userInfo 构建用户列表项 */
function buildUserItem(reg, info, power, remark) {
  return {
    address: reg.address,
    memberId: reg.memberId,
    referrer: reg.referrer || null,
    registeredAt: reg.timestamp
      ? new Date(reg.timestamp * 1000).toISOString()
      : null,
    level: info ? Number(info.level) : null,
    personalAmount: info ? info.personalAmount.formatted : null,
    totalEarned: info ? info.totalEarned.formatted : null,
    pendingUSDT: info ? info.pendingUSDT.formatted : null,
    pendingXMR: info ? info.pendingXMR.formatted : null,
    teamTotalVolume: info ? info.teamTotalVolume.formatted : null,
    exited: info ? info.exited : null,
    isBlacklisted: info ? info.isBlacklisted : null,
    userComputingPower: power,
    remark: remark || "",
  };
}

/**
 * 待处理 XMR 提现列表（基于 db 事件对比，思路同 cache.getPendingXMRWithdrawals）
 * 附带每个待处理用户的链上 xmrAddress、金额、时间戳
 */
async function getPendingXMRWithdrawalList() {
  const requested = db.getEventsByType("XMRWithdrawalRequested", {
    page: 1,
    limit: 0,
  }).items;
  const processed = db.getEventsByType("XMRWithdrawalProcessed", {
    page: 1,
    limit: 0,
  }).items;

  // 每个用户最近一次 Processed 的区块号
  const processedMaxBlock = new Map();
  for (const p of processed) {
    const user = (p.args && p.args.user || "").toLowerCase();
    if (!user) continue;
    const prev = processedMaxBlock.get(user);
    if (prev === undefined || p.blockNumber > prev) {
      processedMaxBlock.set(user, p.blockNumber);
    }
  }

  // 与 cache 逻辑一致：不存在「更晚」的 Processed 事件则视为待处理
  const pending = requested
    .filter((r) => {
      const user = (r.args && r.args.user || "").toLowerCase();
      if (!user) return false;
      const maxBlock = processedMaxBlock.get(user);
      return maxBlock === undefined || r.blockNumber >= maxBlock;
    })
    .sort((a, b) => b.blockNumber - a.blockNumber);

  // 附带链上最新 XMR 收款地址（供人工打款）
  const items = await mapInBatches(pending, 20, async (r) => {
    const user = r.args.user;
    let xmrAddress = r.args.xmrAddr || "";
    try {
      const latest = await blockchain.stakingContract.xmrAddress(user);
      if (latest) xmrAddress = latest;
    } catch {
      /* 读取失败时退回事件里的地址 */
    }
    return {
      user,
      amount: {
        raw: r.args.amount || "0",
        formatted: ethers.formatEther(r.args.amount || 0),
      },
      xmrAddress,
      timestamp: r.timestamp,
      blockNumber: r.blockNumber,
      txHash: r.txHash,
    };
  });

  return items.filter(Boolean);
}

/**
 * 执行 owner-only 操作的统一入口：
 * 管理员钱包是 staking 合约 owner → 直签执行；
 * 否则（owner 为多签合约）→ 编码 calldata 提交多签交易
 */
async function execOwnerOp(fnName, ...args) {
  const owner = await blockchain.stakingContract.owner();
  const signerAddress = blockchain.adminWallet
    ? blockchain.adminWallet.address
    : null;

  // 直签执行
  if (
    signerAddress &&
    signerAddress.toLowerCase() === owner.toLowerCase()
  ) {
    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner[fnName](...args)
    );
    return { mode: "direct", ...result };
  }

  // 提交多签交易
  if (!blockchain.multisigContractWithSigner) {
    throw new Error("管理员钱包未配置，无法发送交易");
  }

  const calldata = blockchain.stakingContract.interface.encodeFunctionData(
    fnName,
    args
  );
  const tx = await blockchain.multisigContractWithSigner.submitTransaction(
    config.stakingContractAddress,
    0n,
    calldata
  );
  const receipt = await tx.wait();

  // 解析回执中的 SubmitTransaction 事件获取 txId
  let txId = null;
  for (const log of receipt.logs || []) {
    try {
      const parsed = blockchain.multisigContract.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed && parsed.name === "SubmitTransaction") {
        txId = parsed.args.txId.toString();
      }
    } catch {
      /* 跳过无关日志 */
    }
  }

  // 查询多签所需确认数与剩余确认数（用于提示信息）
  let required = null;
  let remaining = null;
  try {
    const requiredCount = await blockchain.multisigContract.required();
    required = requiredCount.toString();
    if (txId !== null) {
      const txInfo = await blockchain.multisigContract.getTransaction(txId);
      remaining = Math.max(
        Number(required) - Number(txInfo.numConfirmations),
        0
      );
    }
  } catch {
    /* 查询失败不影响返回 */
  }

  return {
    mode: "multisig",
    txId,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === 1 ? "success" : "failed",
    required,
    remaining,
  };
}

// ======================== 仪表盘 ========================

/**
 * GET /api/admin/stats - 后台仪表盘统计
 */
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const startOfTodaySec = Math.floor(
      new Date().setHours(0, 0, 0, 0) / 1000
    );

    const [stats, pendingXMRList, recentRegistrations, recentInvestments] =
      await Promise.all([
        blockchain.getContractStats(),
        getPendingXMRWithdrawalList(),
        Promise.resolve(
          db.getEventsByType("Registered", { page: 1, limit: 10 })
        ),
        Promise.resolve(
          db.getEventsByType("Invested", { page: 1, limit: 10 })
        ),
      ]);

    const todayStats = db.getTodayStats(startOfTodaySec);

    res.json(
      successResponse({
        totalUsers: stats.totalUsers,
        totalUSDTDeposited: stats.totalUSDTDeposited.formatted,
        todayNewUsers: todayStats.todayNewUsers,
        todayInvestedAmount: ethers.formatEther(
          BigInt(todayStats.todayInvestedAmount || "0")
        ),
        todayWithdrawnAmount: ethers.formatEther(
          BigInt(todayStats.todayWithdrawnAmount || "0")
        ),
        pendingXMRCount: pendingXMRList.length,
        pendingXMRList,
        contractUSDTBalance: stats.contractUSDTBalance.formatted,
        contractXMRBalance: stats.contractXMRBalance.formatted,
        xmrPrice: stats.xmrPrice.formatted,
        dailyRate: stats.dailyRate,
        computingPower: stats.computingPower,
        withdrawFee: stats.withdrawFee,
        paused: stats.paused,
        recentRegistrations: recentRegistrations.items.map((e) => ({
          txHash: e.txHash,
          blockNumber: e.blockNumber,
          timestamp: e.timestamp,
          args: {
            user: e.args ? e.args.user : null,
            referrer: e.args ? e.args.referrer : null,
            memberId: e.args ? e.args.memberId : null,
          },
        })),
        recentInvestments: recentInvestments.items.map((e) => ({
          txHash: e.txHash,
          blockNumber: e.blockNumber,
          timestamp: e.timestamp,
          args: {
            user: e.args ? e.args.user : null,
            amount: e.args && e.args.amount ? ethers.formatEther(e.args.amount) : "0",
            totalPersonal:
              e.args && e.args.totalPersonal
                ? ethers.formatEther(e.args.totalPersonal)
                : "0",
          },
        })),
      })
    );
  })
);

// ======================== 用户管理 ========================

/**
 * GET /api/admin/users - 用户列表
 * query: page, limit, q, level, exited, blacklisted
 */
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const { q, level, exited, blacklisted } = req.query;

    const levelNum =
      level !== undefined && level !== "" ? parseInt(level, 10) : undefined;
    const exitedBool =
      exited !== undefined && exited !== "" ? exited === "true" : undefined;
    const blacklistedBool =
      blacklisted !== undefined && blacklisted !== ""
        ? blacklisted === "true"
        : undefined;
    const hasChainFilter =
      levelNum !== undefined ||
      exitedBool !== undefined ||
      blacklistedBool !== undefined;

    if (hasChainFilter) {
      // 筛选模式：需要链上数据，先取全量注册用户（上限保护）
      const totalRegistered = db.countRegistered();
      if (totalRegistered > 20000) {
        return res
          .status(400)
          .json(errorResponse("筛选模式下用户数过多（超过 20000），请先用搜索缩小范围"));
      }

      const all = db.getRegisteredUsers({ page: 1, limit: totalRegistered, q });
      const enriched = await mapInBatches(all.items, 20, async (reg) => {
        const info = await blockchain.getUserInfo(reg.address);
        const power = await getUserComputingPower(reg.address);
        const remark = db.getUserRemark(reg.address);
        return { reg, info, power, remark };
      });

      const filtered = enriched.filter((it) => {
        if (!it || !it.info) return false;
        if (levelNum !== undefined && Number(it.info.level) !== levelNum) {
          return false;
        }
        if (exitedBool !== undefined && it.info.exited !== exitedBool) {
          return false;
        }
        if (
          blacklistedBool !== undefined &&
          it.info.isBlacklisted !== blacklistedBool
        ) {
          return false;
        }
        return true;
      });

      const total = filtered.length;
      const skip = (page - 1) * limit;
      const items = filtered
        .slice(skip, skip + limit)
        .map((it) => buildUserItem(it.reg, it.info, it.power, it.remark));

      return res.json(successResponse(buildPagination(items, total, page, limit)));
    }

    // 普通分页：db 过滤 + 仅对当前页用户并发补全链上信息
    const result = db.getRegisteredUsers({ page, limit, q });
    const items = await mapInBatches(result.items, 20, async (reg) => {
      let info = null;
      let infoError = null;
      try {
        info = await blockchain.getUserInfo(reg.address);
      } catch (err) {
        infoError = err.message || String(err);
        logger.warn(`getUserInfo failed for ${reg.address}: ${infoError}`);
      }
      const power = await getUserComputingPower(reg.address);
      const remark = db.getUserRemark(reg.address);
      const item = buildUserItem(reg, info, power, remark);
      if (infoError) item._error = infoError;
      return item;
    });

    res.json(
      successResponse(buildPagination(items, result.total, page, limit))
    );
  })
);

/**
 * GET /api/admin/users/:address - 用户详情
 */
router.get(
  "/users/:address",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    const [info, xmrAddress, power, remainingExitLimit, subAreaVolume, referralCount] =
      await Promise.all([
        blockchain.getUserInfo(addr),
        blockchain.stakingContract.xmrAddress(addr).catch(() => ""),
        getUserComputingPower(addr),
        blockchain.getRemainingExitLimit(addr),
        blockchain.getSubAreaVolume(addr),
        blockchain.stakingContract
          .getDirectReferralCount(addr)
          .catch(() => null),
      ]);

    // 上溯推荐人链（最多 12 层，直到 0x0）
    const referrerChain = [];
    let current = info.referrer;
    for (
      let i = 0;
      i < 12 && current && current.toLowerCase() !== ethers.ZeroAddress;
      i++
    ) {
      try {
        const parent = await blockchain.getUserInfo(current);
        referrerChain.push({
          address: current,
          memberId: parent.memberId,
          level: Number(parent.level),
        });
        current = parent.referrer;
      } catch {
        break;
      }
    }

    // 注册时间（来自 db 的 Registered 事件）
    let registeredAt = null;
    try {
      const userEvents = db.getEventsByUser(addr, {
        page: 1,
        limit: 50,
        direction: "all",
      });
      const reg = userEvents.items.find((e) => e.eventType === "Registered");
      if (reg && reg.timestamp) {
        registeredAt = new Date(reg.timestamp * 1000).toISOString();
      }
    } catch {
      /* 忽略 */
    }

    res.json(
      successResponse({
        ...info,
        xmrAddress,
        userComputingPower: power,
        remainingExitLimit,
        subAreaVolume,
        directReferralCount:
          referralCount !== null ? referralCount.toString() : null,
        referrerChain,
        registeredAt,
      })
    );
  })
);

/**
 * PUT /api/admin/users/:address/remark - 更新用户备注
 */
router.put(
  "/users/:address/remark",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    const { remark } = req.body;
    db.setUserRemark(addr, remark);
    logAction(req, {
      action: "set-user-remark",
      target: addr,
      detail: String(remark || ""),
    });

    res.json(
      successResponse({
        address: addr,
        remark: String(remark || ""),
      })
    );
  })
);

/**
 * GET /api/admin/users/:address/referrals - 直推列表
 */
router.get(
  "/users/:address/referrals",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    const { count, referrals } = await blockchain.getDirectReferrals(addr);

    const items = await mapInBatches(referrals, 20, async (r) => {
      const info = await blockchain.getUserInfo(r).catch(() => null);
      return {
        address: r,
        memberId: info ? info.memberId : null,
        level: info ? Number(info.level) : null,
        personalAmount: info ? info.personalAmount.formatted : null,
        teamTotalVolume: info ? info.teamTotalVolume.formatted : null,
        exited: info ? info.exited : null,
        isBlacklisted: info ? info.isBlacklisted : null,
      };
    });

    res.json(successResponse({ count, items }));
  })
);

/**
 * GET /api/admin/users/:address/events - 用户链上事件（来自 db）
 * query: page, limit, direction(all/in/out)
 */
router.get(
  "/users/:address/events",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    const { page, limit } = parsePagination(req.query);
    const direction = req.query.direction || "all";
    const result = db.getEventsByUser(addr, { page, limit, direction });

    res.json(
      successResponse(buildPagination(result.items, result.total, page, limit))
    );
  })
);

/**
 * GET /api/admin/users/:address/tree - 推荐关系树
 * query: depth(默认3，最大4)；同层并发 20；总节点数硬上限 500
 */
router.get(
  "/users/:address/tree",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    let depth = parseInt(req.query.depth, 10);
    if (isNaN(depth) || depth < 1) depth = 3;
    if (depth > 4) depth = 4;

    const MAX_NODES = 500;
    let nodeCount = 1;

    const rootInfo = await blockchain.getUserInfo(addr);
    const root = {
      address: addr,
      memberId: rootInfo.memberId,
      level: Number(rootInfo.level),
      personalAmount: rootInfo.personalAmount.formatted,
      teamTotalVolume: rootInfo.teamTotalVolume.formatted,
      children: [],
    };

    let frontier = [root];
    let truncated = false;

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      // 本层每个节点的直推列表（并发 20）
      const refLists = await mapInBatches(frontier, 20, (node) =>
        blockchain.stakingContract.getDirectReferrals(node.address)
      );

      // 收集下一层父子对（总节点数硬上限）
      const pairs = [];
      refLists.forEach((refs, i) => {
        if (!refs) return;
        for (const childAddress of refs) {
          if (nodeCount + pairs.length >= MAX_NODES) {
            truncated = true;
            break;
          }
          pairs.push({ parent: frontier[i], address: childAddress });
        }
      });

      if (pairs.length === 0) break;

      // 并发补全下一层 userInfo
      const infos = await mapInBatches(pairs, 20, (pair) =>
        blockchain.getUserInfo(pair.address)
      );

      const nextFrontier = [];
      pairs.forEach((pair, i) => {
        const info = infos[i];
        const child = {
          address: pair.address,
          memberId: info ? info.memberId : null,
          level: info ? Number(info.level) : null,
          personalAmount: info ? info.personalAmount.formatted : null,
          teamTotalVolume: info ? info.teamTotalVolume.formatted : null,
          children: [],
        };
        pair.parent.children.push(child);
        nextFrontier.push(child);
      });
      nodeCount += pairs.length;
      frontier = nextFrontier;
    }

    res.json(
      successResponse({ root, totalNodes: nodeCount, truncated, depth })
    );
  })
);

// ======================== 用户操作 ========================

/**
 * POST /api/admin/users/:address/adjust-balance - 调整用户余额（onlyOwner）
 * body: { kind: "USDT"|"XMR", delta: number }（可正可负、非零，18 位小数）
 */
router.post(
  "/users/:address/adjust-balance",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    const { kind, delta } = req.body || {};
    if (kind !== "USDT" && kind !== "XMR") {
      return res.status(400).json(errorResponse("kind 必须为 USDT 或 XMR"));
    }
    const d = Number(delta);
    if (typeof d !== "number" || !isFinite(d) || d === 0) {
      return res
        .status(400)
        .json(errorResponse("delta 必须为非零数字（正数增加、负数扣除）"));
    }

    // USDT/XMR 均为 18 位小数；int256 用 BigInt 符号
    const deltaAbs = ethers.parseEther(String(Math.abs(d)));
    const deltaInt = d > 0 ? deltaAbs : -deltaAbs;

    const fnName = kind === "USDT" ? "adjustUserUSDT" : "adjustUserXMR";
    const result = await execOwnerOp(fnName, addr, deltaInt);
    logAction(req, {
      action: "adjust-balance",
      target: addr,
      detail: `kind=${kind}, delta=${d}`,
      txHash: result.txHash,
    });

    const message =
      result.mode === "multisig"
        ? `已提交多签交易 #${result.txId}：${fnName}，待 ${result.remaining}/${result.required} 确认后执行`
        : `已直接调整用户 ${addr} 的 ${kind} 余额：${d > 0 ? "+" : ""}${d}`;
    res.json(successResponse(result, message));
  })
);

/**
 * POST /api/admin/users/:address/blacklist - 设置黑名单（admin 直签）
 * body: { status: boolean }
 */
router.post(
  "/users/:address/blacklist",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    const { status } = req.body || {};
    if (typeof status !== "boolean") {
      return res.status(400).json(errorResponse("status 必须为布尔值"));
    }

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.setBlacklist(addr, status)
    );
    logAction(req, {
      action: "set-blacklist",
      target: addr,
      detail: `status=${status}`,
      txHash: result.txHash,
    });

    res.json(
      successResponse(result, `用户 ${addr} 黑名单状态已设置为 ${status}`)
    );
  })
);

/**
 * POST /api/admin/users/:address/process-xmr-withdrawal - 处理 XMR 提现（admin 直签）
 */
router.post(
  "/users/:address/process-xmr-withdrawal",
  asyncHandler(async (req, res) => {
    const addr = resolveAddress(req, res);
    if (!addr) return;

    const result = await blockchain.sendAdminTransaction(() =>
      blockchain.stakingContractWithSigner.processXMRWithdrawal(addr)
    );
    logAction(req, {
      action: "process-xmr-withdrawal",
      target: addr,
      txHash: result.txHash,
    });

    res.json(successResponse(result, `用户 ${addr} 的XMR提现已处理`));
  })
);

// ======================== 操作日志 ========================

/**
 * GET /api/admin/logs - 管理操作日志（分页）
 * query: page, limit
 */
router.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const result = db.getAdminLogs({ page, limit });

    res.json(
      successResponse(buildPagination(result.items, result.total, page, limit))
    );
  })
);

module.exports = router;
