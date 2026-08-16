/**
 * 内存缓存服务
 * 提供事件存储、TTL缓存和分页查询功能
 */
const logger = require("../utils/logger");

// 事件类型 -> 资金方向映射（资金明细页使用）
const FLOW_DIRECTION_MAP = {
  Invested: "out",
  StaticRewardClaimed: "in",
  GenerationReward: "in",
  TeamReward: "in",
  FlashExchanged: "swap",
  USDTWithdrawn: "out",
  XMRWithdrawalRequested: "out",
  XMRWithdrawalProcessed: "out",
};

class CacheService {
  constructor() {
    // 事件存储：按事件类型分类存储
    this.events = {
      investments: [],
      rewards: [],
      withdrawals: [],
      registrations: [],
      flashExchanges: [],
      all: [],
    };

    // 事件最后扫描区块
    this.lastScannedBlock = 0;

    // TTL 缓存（带过期时间）
    this.ttlCache = new Map();
  }

  // ======================== 事件存储 ========================

  /**
   * 添加事件到缓存（去重）
   * @param {string} category - 事件分类
   * @param {object} event - 格式化后的事件对象
   */
  addEvent(category, event) {
    const store = this.events[category];
    if (!store) return;

    // 去重：按 txHash + logIndex 判断
    const exists = store.some(
      (e) => e.txHash === event.txHash && e.logIndex === event.logIndex
    );
    if (!exists) {
      store.push(event);
    }
  }

  /**
   * 添加到 "all" 分类
   */
  addToAll(event) {
    const exists = this.events.all.some(
      (e) => e.txHash === event.txHash && e.logIndex === event.logIndex
    );
    if (!exists) {
      this.events.all.push(event);
    }
  }

  /**
   * 获取分类事件（分页，按区块号倒序）
   * @param {string} category - 事件分类
   * @param {number} page - 页码
   * @param {number} limit - 每页条数
   * @returns {{ items: Array, total: number, page: number, limit: number }}
   */
  getEvents(category, page, limit) {
    const store = this.events[category] || [];
    // 按 blockNumber 倒序，再按 logIndex 倒序
    const sorted = [...store].sort((a, b) => {
      if (b.blockNumber !== a.blockNumber) {
        return b.blockNumber - a.blockNumber;
      }
      return b.logIndex - a.logIndex;
    });

    const total = sorted.length;
    const skip = (page - 1) * limit;
    const items = sorted.slice(skip, skip + limit);

    return { items, total, page, limit };
  }

  /**
   * 获取指定地址相关的所有事件
   * @param {string} address - 用户地址
   * @param {number} page - 页码
   * @param {number} limit - 每页条数
   * @param {"all"|"in"|"out"} direction - 资金方向过滤（资金明细用）
   */
  getEventsByAddress(address, page, limit, direction = "all") {
    const addr = address.toLowerCase();
    const all = this.events.all.filter((e) => {
      // 检查事件的 args 中是否有匹配的地址
      if (!e.args) return false;
      return Object.values(e.args).some(
        (v) =>
          typeof v === "string" && v.toLowerCase() === addr
      );
    });

    // 资金方向过滤
    let filtered = all;
    if (direction !== "all") {
      filtered = all.filter((e) => FLOW_DIRECTION_MAP[e.eventType] === direction);
    }

    const sorted = filtered.sort((a, b) => {
      if (b.blockNumber !== a.blockNumber) {
        return b.blockNumber - a.blockNumber;
      }
      return b.logIndex - a.logIndex;
    });

    const total = sorted.length;
    const skip = (page - 1) * limit;
    const items = sorted.slice(skip, skip + limit);

    return { items, total, page, limit };
  }

  /**
   * 获取待处理的 XMR 提现列表
   * 通过对比 XMRWithdrawalRequested 和 XMRWithdrawalProcessed 事件
   */
  getPendingXMRWithdrawals(page, limit) {
    // 获取所有请求事件
    const requested = this.events.withdrawals.filter(
      (e) => e.eventType === "XMRWithdrawalRequested"
    );

    // 获取所有已处理事件
    const processedUsers = new Set();
    this.events.withdrawals
      .filter((e) => e.eventType === "XMRWithdrawalProcessed")
      .forEach((e) => {
        // 记录已处理的用户（简化处理：认为用户最近一次请求已被处理）
        if (e.args && e.args.user) {
          processedUsers.add(e.args.user.toLowerCase());
        }
      });

    // 过滤出未处理的请求
    const pending = requested.filter((e) => {
      // 简化：如果有相同用户在更晚的 Processed 事件，则认为已处理
      const userAddr = e.args?.user?.toLowerCase();
      if (!userAddr) return true;

      const hasProcessedAfter = this.events.withdrawals.some(
        (p) =>
          p.eventType === "XMRWithdrawalProcessed" &&
          p.args?.user?.toLowerCase() === userAddr &&
          p.blockNumber > e.blockNumber
      );
      return !hasProcessedAfter;
    });

    const sorted = pending.sort((a, b) => b.blockNumber - a.blockNumber);
    const total = sorted.length;
    const skip = (page - 1) * limit;
    const items = sorted.slice(skip, skip + limit);

    return { items, total, page, limit };
  }

  /**
   * 更新最后扫描区块
   */
  setLastScannedBlock(blockNumber) {
    this.lastScannedBlock = blockNumber;
  }

  /**
   * 获取最后扫描区块
   */
  getLastScannedBlock() {
    return this.lastScannedBlock;
  }

  // ======================== TTL 缓存 ========================

  /**
   * 设置带TTL的缓存
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - 过期时间（毫秒）
   */
  set(key, value, ttl = 30000) {
    this.ttlCache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * 获取缓存值（如已过期则返回 null）
   * @param {string} key - 缓存键
   * @returns {*} 缓存值或 null
   */
  get(key) {
    const entry = this.ttlCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.ttlCache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * 删除缓存
   */
  delete(key) {
    this.ttlCache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.ttlCache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      events: {
        investments: this.events.investments.length,
        rewards: this.events.rewards.length,
        withdrawals: this.events.withdrawals.length,
        registrations: this.events.registrations.length,
        flashExchanges: this.events.flashExchanges.length,
        all: this.events.all.length,
      },
      lastScannedBlock: this.lastScannedBlock,
      ttlCacheSize: this.ttlCache.size,
    };
  }
}

// 导出单例
const cacheService = new CacheService();
module.exports = cacheService;
