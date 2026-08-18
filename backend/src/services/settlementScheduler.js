/**
 * 结算调度服务
 * 正式环境：每日北京时间 12:01 自动执行一次 dailySettlement（价格取实时 XMR/USD）
 * 周期边界由合约 SETTLEMENT_ANCHOR 锚定（= 北京 12:00），本调度器只需在边界后触发即可
 */
const { ethers } = require("ethers");
const config = require("../config/env");
const logger = require("../utils/logger");
const blockchain = require("./blockchain");

let timer = null;
let running = false;

const DEFAULT_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=usd";

/**
 * 获取实时 XMR/USD 价格；失败返回 null
 */
async function fetchXmrUsdPrice() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(config.settlementPriceUrl || DEFAULT_PRICE_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      logger.warn(`XMR 价格接口返回 ${res.status}`);
      return null;
    }
    const body = await res.json();
    const price = Number(body && body.monero && body.monero.usd);
    if (!Number.isFinite(price) || price <= 0) {
      logger.warn("XMR 价格接口返回无效数据:", JSON.stringify(body));
      return null;
    }
    return price;
  } catch (err) {
    logger.warn(`获取 XMR 实时价格失败: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 计算链上当前结算周期编号（与合约 _currentPeriod 一致）
 */
async function getCurrentPeriod() {
  const [interval, anchor] = await Promise.all([
    blockchain.stakingContract.SETTLEMENT_INTERVAL(),
    blockchain.stakingContract.SETTLEMENT_ANCHOR(),
  ]);
  const now = Math.floor(Date.now() / 1000);
  return {
    interval: Number(interval),
    currentPeriod: Math.max(0, Math.floor((now - Number(anchor)) / Number(interval))),
  };
}

/**
 * 执行一轮自动结算（含实时价格获取）
 * @returns {object|null} 结算结果，跳过时返回 null
 */
async function runSettlement() {
  if (running) return null;
  running = true;
  try {
    if (!blockchain.stakingContractWithSigner) {
      logger.warn("未配置管理员钱包，自动结算跳过");
      return null;
    }

    const stats = await blockchain.stakingContract.getContractStats();
    if (stats.paused) {
      logger.info("合约已暂停，本轮自动结算跳过");
      return null;
    }

    const { currentPeriod } = await getCurrentPeriod();
    const lastPeriod = Number(
      await blockchain.stakingContract.lastSettlementPeriod()
    );
    if (currentPeriod <= lastPeriod) {
      return null;
    }

    const livePrice = await fetchXmrUsdPrice();
    if (livePrice) {
      logger.info(`XMR 实时价格: ${livePrice} USDT`);
    } else {
      logger.warn("实时价格获取失败，本轮使用链上现有价格结算");
    }
    const priceWei = livePrice
      ? ethers.parseEther(String(livePrice))
      : stats.xmrPrice;
    if (!priceWei || priceWei === 0n) {
      logger.error("无可用 XMR 价格，本轮自动结算跳过");
      return null;
    }

    const tx = await blockchain.stakingContractWithSigner.dailySettlement(
      priceWei
    );
    const receipt = await tx.wait();
    logger.info(
      `自动结算完成: 周期 ${currentPeriod}, 价格 ${livePrice || "链上价格"}, 交易 ${tx.hash}, 状态 ${
        receipt.status === 1 ? "成功" : "失败"
      }`
    );
    return {
      txHash: tx.hash,
      period: currentPeriod,
      price: livePrice ? String(livePrice) : ethers.formatEther(stats.xmrPrice),
      status: receipt.status === 1 ? "success" : "failed",
    };
  } catch (err) {
    logger.error("自动结算失败:", err.message);
    return null;
  } finally {
    running = false;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 计算下一次触发时间：北京时间 12:01（UTC 04:01）
 * 合约周期边界在北京 12:00（SETTLEMENT_ANCHOR 锚定），12:01 触发可确保 currentPeriod 已 +1
 */
function nextRunTime() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(4, 1, 0, 0); // UTC 04:01 = 北京 12:01
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * 启动调度：首次延迟到下一个北京 12:01，之后每 24 小时执行一次
 */
function start() {
  if (!config.settlementEnabled) {
    logger.info("自动结算调度已禁用 (SETTLEMENT_ENABLED=false)");
    return;
  }

  const firstRun = nextRunTime();
  const delayMs = firstRun.getTime() - Date.now();
  logger.info(
    `自动结算调度已启动，每日北京时间 12:01 执行（首次触发于 ${firstRun.toISOString()}，约 ${Math.round(
      delayMs / 60000
    )} 分钟后）`
  );

  timer = setTimeout(() => {
    runSettlement().catch((err) =>
      logger.error("定时自动结算异常:", err.message)
    );
    timer = setInterval(() => {
      runSettlement().catch((err) =>
        logger.error("定时自动结算异常:", err.message)
      );
    }, DAY_MS);
  }, delayMs);
}

/**
 * 停止调度
 */
function stop() {
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
    timer = null;
    logger.info("自动结算调度已停止");
  }
}

/**
 * 手动触发（供路由复用）
 */
async function triggerSettlement() {
  return runSettlement();
}

module.exports = {
  start,
  stop,
  triggerSettlement,
  fetchXmrUsdPrice,
};
