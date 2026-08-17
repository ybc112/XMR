/**
 * 事件扫描服务
 * 定时扫描合约事件并缓存到内存中
 */
const { ethers } = require("ethers");
const config = require("../config/env");
const logger = require("../utils/logger");
const cache = require("./cache");
const db = require("./db");
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
  WithdrawFeeUpdated: "investments",
  XMRPriceUpdated: "investments",
  LevelUpdated: "investments",
  XMRAddressSet: "withdrawals",
  BalanceAdjusted: "investments",
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
 * 优化：全部事件 topic 合并为一次 eth_getLogs 查询（OR 语义），
 * 避免逐个事件查询导致公共节点限流/超时（此前 22 次/批 → 1 次/批）。
 * 查询失败直接抛出，由 performScan 捕获：不推进扫描进度，下轮重试。
 */
async function scanBlockRange(fromBlock, toBlock) {
  // 带重试的 getLogs（公共节点限流严重，不传 topics 减少请求复杂度）
  let rawLogs;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rawLogs = await provider.getLogs({
        address: config.stakingContractAddress,
        fromBlock,
        toBlock,
      });
      break;
    } catch (e) {
      const msg = String(e.message || "");
      if (attempt < 4 && (msg.includes("rate limit") || msg.includes("429") || msg.includes("missing response"))) {
        const wait = Math.min(2000 * (attempt + 1), 10000);
        logger.warn(`getLogs 限流，${wait / 1000}s 后重试 (${attempt + 1}/5)`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }

  const totalEvents = [];
  for (const rawLog of rawLogs) {
    try {
      const parsed = stakingContract.interface.parseLog(rawLog);
      if (!parsed) continue;

      const formatted = {
        eventType: parsed.name,
        txHash: rawLog.transactionHash,
        blockNumber: rawLog.blockNumber,
        logIndex: rawLog.index,
        address: rawLog.address,
        args: formatEventArgs(parsed.args, parsed.fragment),
      };
      totalEvents.push(formatted);

      // 添加到对应分类
      const category = EVENT_CATEGORY_MAP[parsed.name];
      if (category) {
        cache.addEvent(category, formatted);
      }
      // 添加到 all
      cache.addToAll(formatted);

      // 持久化到 SQLite（INSERT OR IGNORE 去重）
      try {
        db.insertEvent(formatted);
      } catch (err) {
        logger.debug(
          `事件落库失败 (${formatted.txHash}#${formatted.logIndex}):`,
          err.message
        );
      }
    } catch (err) {
      logger.debug(
        `解析日志失败 (${rawLog.transactionHash}#${rawLog.index}):`,
        err.message
      );
    }
  }

  return totalEvents;
}

/**
 * 为本批事件涉及的区块补齐时间戳
 * 已有 block_timestamps 的直接复用，缺失的用 provider.getBlock 拉取（并发 ≤5，失败跳过）
 */
async function backfillBlockTimestamps(events) {
  if (!events || events.length === 0) return;

  const blocks = [...new Set(events.map((e) => e.blockNumber))];
  const timestampMap = new Map();
  const missing = [];

  // 先查本地缓存表
  for (const blockNumber of blocks) {
    const ts = db.getBlockTimestamp(blockNumber);
    if (ts != null) {
      timestampMap.set(blockNumber, ts);
    } else {
      missing.push(blockNumber);
    }
  }

  // 缺失的并发拉取（每批 ≤5）
  const CONCURRENCY = 5;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const chunk = missing.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(
      chunk.map(async (blockNumber) => {
        try {
          const block = await provider.getBlock(blockNumber);
          return block ? [blockNumber, Number(block.timestamp)] : null;
        } catch {
          return null; // 拉取失败跳过该区块
        }
      })
    );
    for (const item of fetched) {
      if (item) timestampMap.set(item[0], item[1]);
    }
  }

  if (timestampMap.size === 0) return;

  // 写入时间戳表并回填 events
  db.saveBlockTimestamps(timestampMap);
  db.updateEventTimestamps(timestampMap);
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

    // 扫描起点优先级：内存缓存 > 数据库 scan_state > 配置起始区块
    let lastScanned = cache.getLastScannedBlock();
    if (!lastScanned) {
      const dbLast = parseInt(db.getScanState("lastScannedBlock") || "0", 10);
      if (dbLast > 0) {
        lastScanned = dbLast;
        cache.setLastScannedBlock(dbLast);
        logger.info(`从数据库恢复扫描进度: 区块 ${dbLast}`);
      }
    }

    let fromBlock;
    if (lastScanned > 0) {
      fromBlock = lastScanned + 1; // 从上次扫描的下一个区块开始
    } else {
      fromBlock = config.startBlock;
      logger.info(
        `首次扫描，从区块 ${fromBlock} 开始`
      );
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

      // 为本批事件涉及的区块补齐时间戳
      await backfillBlockTimestamps(events);

      currentBlock = batchEnd + 1;

      // 更新已扫描区块（内存 + 数据库）
      cache.setLastScannedBlock(batchEnd);
      db.setScanState("lastScannedBlock", String(batchEnd));
    }

    initialized = true;
    cache.setLastScannedBlock(latestBlock);
    db.setScanState("lastScannedBlock", String(latestBlock));

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
 * 启动时从数据库回填内存缓存（cache.addEvent/addToAll 已去重）
 * 避免重启后内存数据丢失
 */
function loadCacheFromDb(limitPerType = 5000) {
  let loaded = 0;
  for (const eventName of EVENTS_TO_SCAN) {
    try {
      const { items } = db.getEventsByType(eventName, { page: 1, limit: limitPerType });
      const category = EVENT_CATEGORY_MAP[eventName];
      for (const evt of items) {
        if (category) {
          cache.addEvent(category, evt);
        }
        cache.addToAll(evt);
        loaded++;
      }
    } catch (err) {
      logger.warn(`从数据库回填事件 ${eventName} 失败: ${err.message}`);
    }
  }
  logger.info(`已从数据库回填 ${loaded} 个事件到内存缓存`);
  return loaded;
}

/**
 * 启动事件扫描服务
 */
function start() {
  logger.info("启动事件扫描服务...");
  logger.info(
    `配置: 起始区块=${config.startBlock}, 间隔=${config.scanInterval}ms, 批次大小=${config.scanBatchSize}`
  );

  // 先从数据库回填内存缓存，再执行扫描
  try {
    loadCacheFromDb();
  } catch (err) {
    logger.warn("从数据库回填内存缓存失败:", err.message);
  }

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
  loadCacheFromDb,
  EVENTS_TO_SCAN,
  EVENT_CATEGORY_MAP,
};
