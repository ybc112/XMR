/**
 * 结算调度服务
 * 测试期每 30 分钟自动执行一次 dailySettlement（价格取实时 XMR/USD）
 * 上线后改回每日一次：合约 SETTLEMENT_INTERVAL 改 86400、SETTLEMENT_ANCHOR 改 4*3600，
 * 并将 SETTLEMENT_INTERVAL_MINUTES 调整为对齐北京时间 12:00 的调度
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

/**
 * 启动调度
 */
function start() {
  if (!config.settlementEnabled) {
    logger.info("自动结算调度已禁用 (SETTLEMENT_ENABLED=false)");
    return;
  }

  const intervalMs = Math.max(1, config.settlementIntervalMinutes) * 60 * 1000;
  logger.info(
    `自动结算调度已启动，间隔 ${config.settlementIntervalMinutes} 分钟`
  );

  runSettlement().catch((err) =>
    logger.error("启动时自动结算异常:", err.message)
  );

  timer = setInterval(() => {
    runSettlement().catch((err) =>
      logger.error("定时自动结算异常:", err.message)
    );
  }, intervalMs);
}

/**
 * 停止调度
 */
function stop() {
  if (timer) {
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
