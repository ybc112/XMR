/**
 * 事件扫描服务
 * 定时扫描合约事件并缓存到内存中
 */
const { ethers } = require("ethers");
const config = require("../config/env");
const logger = require("../utils/logger");
const cache = require("./cache");
const {
  stakingContract,
  provider,
} = require("./blockchain");

// 事件类型 -> 缓存分类映射
const EVENT_CATEGORY_MAP = {
  Invested: "investments",
  StaticRewardClaimed: "rewards",
  GenerationReward: "rewards",
  TeamReward: "rewards",
  USDTWithdrawn: "withdrawals",
  XMRWithdrawalRequested: "withdrawals",
  XMRWithdrawalProcessed: "withdrawals",
  Registered: "registrations",
  FlashExchanged: "flashExchanges",
  Exited: "withdrawals",
  DailySettlement: "rewards",
  BlacklistUpdated: "investments",
  Paused: "investments",
  Unpaused: "investments",
  AdminUpdated: "investments",
  DailyRateUpdated: "investments",
  ComputingPowerUpdated: "investments",
  XMRPriceUpdated: "investments",
  LevelUpdated: "investments",
};

// 要扫描的所有事件名
const EVENTS_TO_SCAN = Object.keys(EVENT_CATEGORY_MAP);

// 扫描状态
let isScanning = false;
let scanTimer = null;
let initialized = false;

/**
 * 格式化事件参数（将 BigInt 转为字符串）
 */
function formatEventArgs(args, eventFragment) {
  const formatted = {};
  if (!args || !eventFragment) return formatted;

  eventFragment.inputs.forEach((input) => {
    const name = input.name || input.type;
    const value = args[name] !== undefined ? args[name] : args[input.name];
    if (value === undefined) return;

    if (typeof value === "bigint") {
      formatted[name] = value.toString();
    } else if (Array.isArray(value)) {
      formatted[name] = value.map((v) =>
        typeof v === "bigint" ? v.toString() : v
      );
    } else if (typeof value === "object" && value !== null && value._hex) {
      formatted[name] = value.toString();
    } else {
      formatted[name] = value;
    }
  });

  return formatted;
}

/**
 * 将 ethers EventLog 转为统一格式的事件对象
 */
function formatEventLog(eventLog) {
  const fragment = eventLog.eventFragment;
  return {
    eventType: fragment.name,
    txHash: eventLog.transactionHash,
    blockNumber: eventLog.blockNumber,
    logIndex: eventLog.index,
    address: eventLog.address,
    args: formatEventArgs(eventLog.args, fragment),
  };
}

/**
 * 扫描指定区块范围内的事件
 */
async function scanBlockRange(fromBlock, toBlock) {
  const totalEvents = [];

  for (const eventName of EVENTS_TO_SCAN) {
    try {
      const eventFilter = stakingContract.filters[eventName]();
      const logs = await stakingContract.queryFilter(
        eventFilter,
        fromBlock,
        toBlock
      );

      for (const log of logs) {
        const formatted = formatEventLog(log);
        totalEvents.push(formatted);

        // 添加到对应分类
        const category = EVENT_CATEGORY_MAP[eventName];
        if (category) {
          cache.addEvent(category, formatted);
        }
        // 添加到 all
        cache.addToAll(formatted);
      }
    } catch (err) {
      // 某个事件查询失败不影响其他事件
      logger.debug(
        `扫描事件 ${eventName} (区块 ${fromBlock}-${toBlock}) 失败:`,
        err.message
      );
    }
  }

  return totalEvents;
}

/**
 * 执行一次完整的扫描（从上次扫描位置到最新区块）
 */
async function performScan() {
  if (isScanning) {
    logger.debug("上一次扫描仍在进行中，跳过本次");
    return;
  }

  isScanning = true;

  try {
    const latestBlock = await provider.getBlockNumber();
    let fromBlock = cache.getLastScannedBlock();

    // 首次扫描从配置的起始区块开始
    if (fromBlock === 0 && !initialized) {
      fromBlock = config.startBlock;
      logger.info(
        `首次扫描，从区块 ${fromBlock} 开始`
      );
    } else {
      fromBlock = fromBlock + 1; // 从上次扫描的下一个区块开始
    }

    if (fromBlock > latestBlock) {
      logger.debug(`无需扫描，当前最新区块 ${latestBlock}，已扫描到 ${fromBlock - 1}`);
      return;
    }

    logger.info(
      `开始扫描事件: ${fromBlock} -> ${latestBlock} (${latestBlock - fromBlock + 1} 个区块)`
    );

    // 分批扫描
    let currentBlock = fromBlock;
    let totalFound = 0;

    while (currentBlock <= latestBlock) {
      const batchEnd = Math.min(
        currentBlock + config.scanBatchSize - 1,
        latestBlock
      );

      const events = await scanBlockRange(currentBlock, batchEnd);
      totalFound += events.length;

      currentBlock = batchEnd + 1;

      // 更新已扫描区块
      cache.setLastScannedBlock(batchEnd);
    }

    initialized = true;
    cache.setLastScannedBlock(latestBlock);

    const stats = cache.getStats();
    logger.info(
      `扫描完成，本次发现 ${totalFound} 个事件。缓存统计:`,
      stats
    );
  } catch (err) {
    logger.error("事件扫描失败:", err.message);
  } finally {
    isScanning = false;
  }
}

/**
 * 启动事件扫描服务
 */
function start() {
  logger.info("启动事件扫描服务...");
  logger.info(
    `配置: 起始区块=${config.startBlock}, 间隔=${config.scanInterval}ms, 批次大小=${config.scanBatchSize}`
  );

  // 立即执行一次初始扫描
  performScan().then(() => {
    // 之后定时扫描
    scanTimer = setInterval(() => {
      performScan().catch((err) => {
        logger.error("定时扫描异常:", err.message);
      });
    }, config.scanInterval);

    logger.info(`定时扫描已启动，间隔 ${config.scanInterval}ms`);
  });
}

/**
 * 停止事件扫描服务
 */
function stop() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
    logger.info("事件扫描服务已停止");
  }
}

/**
 * 手动触发一次扫描
 */
async function triggerScan() {
  return performScan();
}

/**
 * 获取扫描状态
 */
function getStatus() {
  return {
    isScanning,
    initialized,
    lastScannedBlock: cache.getLastScannedBlock(),
    cacheStats: cache.getStats(),
  };
}

module.exports = {
  start,
  stop,
  triggerScan,
  getStatus,
  EVENTS_TO_SCAN,
  EVENT_CATEGORY_MAP,
};
