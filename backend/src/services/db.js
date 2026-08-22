/**
 * SQLite 持久化服务
 * 事件落库、后台管理员账号、操作日志、扫描状态、区块时间戳
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const config = require("../config/env");
const logger = require("../utils/logger");

// 数据库文件路径（data 目录不存在则创建）
const dbFile = path.resolve(config.dbPath);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const sqlite = new Database(dbFile);
sqlite.pragma("journal_mode = WAL");

// ======================== 建表 ========================

sqlite.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventType TEXT NOT NULL,
  txHash TEXT NOT NULL,
  blockNumber INTEGER NOT NULL,
  logIndex INTEGER NOT NULL,
  logAddress TEXT,
  userAddress TEXT,
  argsJson TEXT,
  timestamp INTEGER,
  UNIQUE(txHash, logIndex)
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(userAddress);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(eventType);
CREATE INDEX IF NOT EXISTS idx_events_block ON events(blockNumber);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  action TEXT,
  target TEXT,
  detail TEXT,
  tx_hash TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS block_timestamps (
  blockNumber INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_remarks (
  address TEXT PRIMARY KEY,
  remark TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
`);

logger.info(`SQLite 数据库已连接: ${dbFile}`);

// ======================== 事件存储 ========================

// 资金方向：out（资金流出用户）/ in（资金流入用户）；FlashExchanged 为 swap（不在 in/out 中）
// XMRWithdrawalProcessed 对用户是 XMR 到账（转入钱包余额），计为 in
const OUT_EVENT_TYPES = [
  "Invested",
  "USDTWithdrawn",
  "XMRWithdrawalRequested",
];
const IN_EVENT_TYPES = [
  "StaticRewardClaimed",
  "GenerationReward",
  "TeamReward",
  "XMRWithdrawalProcessed",
];

/**
 * 从事件 args 中提取用户地址
 * 优先级：args.user > args.receiver > args.investor > args.owner > 第一个 0x 开头长度 42 的字符串
 */
function extractUserAddress(args) {
  if (!args || typeof args !== "object") return null;

  const isAddressLike = (v) =>
    typeof v === "string" && v.toLowerCase().startsWith("0x") && v.length === 42;

  for (const key of ["user", "receiver", "investor", "owner"]) {
    if (isAddressLike(args[key])) return args[key];
  }
  for (const value of Object.values(args)) {
    if (isAddressLike(value)) return value;
  }
  return null;
}

const stmtInsertEvent = sqlite.prepare(`
  INSERT OR IGNORE INTO events(eventType, txHash, blockNumber, logIndex, logAddress, userAddress, argsJson)
  VALUES(@eventType, @txHash, @blockNumber, @logIndex, @logAddress, @userAddress, @argsJson)
`);

/**
 * 插入事件（INSERT OR IGNORE，按 txHash+logIndex 去重）
 * @param {object} event - eventScanner 格式化对象 {eventType,txHash,blockNumber,logIndex,address,args}
 * @returns {boolean} 是否真正插入（false = 重复被忽略）
 */
function insertEvent(event) {
  if (!event || !event.txHash) return false;
  const info = stmtInsertEvent.run({
    eventType: event.eventType,
    txHash: event.txHash,
    blockNumber: Number(event.blockNumber),
    logIndex: Number(event.logIndex),
    logAddress: event.address || null,
    userAddress: extractUserAddress(event.args),
    argsJson: JSON.stringify(event.args || {}),
  });
  return info.changes > 0;
}

/** 数据库行 -> 统一事件对象（附带解析后的 args 与 timestamp） */
function rowToEvent(row) {
  return {
    id: row.id,
    eventType: row.eventType,
    txHash: row.txHash,
    blockNumber: row.blockNumber,
    logIndex: row.logIndex,
    address: row.logAddress,
    userAddress: row.userAddress,
    args: row.argsJson ? JSON.parse(row.argsJson) : {},
    timestamp: row.timestamp != null ? row.timestamp : null,
  };
}

/** 规范化分页参数 */
function normalizePage(page, limit, defaultLimit = 20) {
  page = parseInt(page, 10);
  limit = parseInt(limit, 10);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  return { page, limit };
}

/**
 * 按用户查询事件（direction: all/in/out）
 */
function getEventsByUser(userAddr, { page = 1, limit = 20, direction = "all" } = {}) {
  ({ page, limit } = normalizePage(page, limit));

  const conditions = ["LOWER(userAddress) = LOWER(?)"];
  const params = [userAddr];

  if (direction === "out") {
    conditions.push(`eventType IN (${OUT_EVENT_TYPES.map(() => "?").join(",")})`);
    params.push(...OUT_EVENT_TYPES);
  } else if (direction === "in") {
    conditions.push(`eventType IN (${IN_EVENT_TYPES.map(() => "?").join(",")})`);
    params.push(...IN_EVENT_TYPES);
  }

  const where = conditions.join(" AND ");
  const total = sqlite
    .prepare(`SELECT COUNT(*) AS c FROM events WHERE ${where}`)
    .get(...params).c;
  const rows = sqlite
    .prepare(
      `SELECT * FROM events WHERE ${where} ORDER BY blockNumber DESC, logIndex DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);

  return { items: rows.map(rowToEvent), total, page, limit };
}

/**
 * 按事件类型查询（limit 为 0 表示取全部）
 */
function getEventsByType(eventType, { page = 1, limit = 20 } = {}) {
  ({ page, limit } = normalizePage(page, limit));

  const total = sqlite
    .prepare("SELECT COUNT(*) AS c FROM events WHERE eventType = ?")
    .get(eventType).c;

  let rows;
  if (limit > 0) {
    rows = sqlite
      .prepare(
        "SELECT * FROM events WHERE eventType = ? ORDER BY blockNumber DESC, logIndex DESC LIMIT ? OFFSET ?"
      )
      .all(eventType, limit, (page - 1) * limit);
  } else {
    rows = sqlite
      .prepare(
        "SELECT * FROM events WHERE eventType = ? ORDER BY blockNumber DESC, logIndex DESC"
      )
      .all(eventType);
  }

  return { items: rows.map(rowToEvent), total, page, limit };
}

/**
 * 分页查询注册用户（数据源 Registered 事件）
 * q 支持：地址（不区分大小写 contains）/ memberId 精确与前缀匹配
 */
function getRegisteredUsers({ page = 1, limit = 20, q, sort } = {}) {
  ({ page, limit } = normalizePage(page, limit));
  const dir = sort === "asc" ? "ASC" : "DESC";

  const conditions = ["eventType = 'Registered'"];
  const params = [];
  if (q !== undefined && q !== null && String(q).trim() !== "") {
    const query = String(q).trim();
    if (query.toLowerCase().startsWith("0x")) {
      // 按地址模糊匹配
      conditions.push("LOWER(userAddress) LIKE ?");
      params.push(`%${query.toLowerCase()}%`);
    } else {
      // 按 memberId 精确/前缀匹配（argsJson 中形如 "memberId":"123"）
      conditions.push("argsJson LIKE ?");
      params.push(`%"memberId":"${query}%`);
    }
  }

  const where = conditions.join(" AND ");
  const total = sqlite
    .prepare(`SELECT COUNT(*) AS c FROM events WHERE ${where}`)
    .get(...params).c;
  const rows = sqlite
    .prepare(
      `SELECT * FROM events WHERE ${where} ORDER BY blockNumber ${dir}, logIndex ${dir} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);

  const items = rows.map((row) => {
    const args = row.argsJson ? JSON.parse(row.argsJson) : {};
    return {
      address: row.userAddress || args.user || null,
      referrer: args.referrer || null,
      memberId: args.memberId !== undefined && args.memberId !== null ? String(args.memberId) : null,
      blockNumber: row.blockNumber,
      txHash: row.txHash,
      timestamp: row.timestamp != null ? row.timestamp : null,
    };
  });

  return { items, total, page, limit };
}

/** 注册用户总数 */
function countRegistered() {
  return sqlite
    .prepare("SELECT COUNT(*) AS c FROM events WHERE eventType = 'Registered'")
    .get().c;
}

/**
 * 对 args.amount（wei 字符串）做 BigInt 累加求和
 */
function sumAmounts(sql, ...params) {
  let sum = 0n;
  const rows = sqlite.prepare(sql).all(...params);
  for (const row of rows) {
    try {
      const args = row.argsJson ? JSON.parse(row.argsJson) : {};
      if (args.amount !== undefined && args.amount !== null) {
        sum += BigInt(args.amount);
      }
    } catch {
      // 跳过解析失败的行
    }
  }
  return sum.toString();
}

/**
 * 今日统计（时间均为秒级 Unix 时间戳）
 * 返回 { todayNewUsers, todayInvestedAmount(wei 字符串), todayWithdrawnAmount(wei 字符串) }
 */
function getTodayStats(startOfTodaySec) {
  const todayNewUsers = sqlite
    .prepare("SELECT COUNT(*) AS c FROM events WHERE eventType = 'Registered' AND timestamp >= ?")
    .get(startOfTodaySec).c;
  const todayInvestedAmount = sumAmounts(
    "SELECT argsJson FROM events WHERE eventType = 'Invested' AND timestamp >= ?",
    startOfTodaySec
  );
  const todayWithdrawnAmount = sumAmounts(
    "SELECT argsJson FROM events WHERE eventType = 'USDTWithdrawn' AND timestamp >= ?",
    startOfTodaySec
  );
  return { todayNewUsers, todayInvestedAmount, todayWithdrawnAmount };
}

/**
 * 单个用户在 sinceTs 之后的新增投资额（新增业绩，wei 字符串）
 * @param {string} address 用户地址
 * @param {number} sinceTs 起始秒级时间戳
 */
function sumUserInvestedSince(address, sinceTs) {
  return sumAmounts(
    "SELECT argsJson FROM events WHERE eventType = 'Invested' AND LOWER(userAddress) = LOWER(?) AND timestamp >= ?",
    address,
    sinceTs
  );
}

/** 时间区间内 Invested 总额（wei 字符串，闭区间） */
function sumInvestedBetween(fromTs, toTs) {  return sumAmounts(
    "SELECT argsJson FROM events WHERE eventType = 'Invested' AND timestamp >= ? AND timestamp <= ?",
    fromTs,
    toTs
  );
}

/** 所有出现过的用户地址（去重） */
function getAllUserAddresses() {
  const rows = sqlite
    .prepare("SELECT DISTINCT userAddress FROM events WHERE userAddress IS NOT NULL")
    .all();
  return rows.map((r) => r.userAddress);
}

// ======================== 扫描状态与区块时间戳 ========================

const stmtSetScanState = sqlite.prepare(`
  INSERT INTO scan_state(key, value) VALUES(?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

function setScanState(key, value) {
  stmtSetScanState.run(String(key), String(value));
}

function getScanState(key) {
  const row = sqlite.prepare("SELECT value FROM scan_state WHERE key = ?").get(String(key));
  return row ? row.value : null;
}

/**
 * 批量写入区块时间戳（接受 Map 或普通对象）
 */
function saveBlockTimestamps(map) {
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map || {});
  if (entries.length === 0) return;
  const stmt = sqlite.prepare(`
    INSERT INTO block_timestamps(blockNumber, timestamp) VALUES(?, ?)
    ON CONFLICT(blockNumber) DO UPDATE SET timestamp = excluded.timestamp
  `);
  sqlite.transaction((list) => {
    for (const [blockNumber, timestamp] of list) {
      stmt.run(Number(blockNumber), Number(timestamp));
    }
  })(entries);
}

function getBlockTimestamp(blockNumber) {
  const row = sqlite
    .prepare("SELECT timestamp FROM block_timestamps WHERE blockNumber = ?")
    .get(Number(blockNumber));
  return row ? row.timestamp : null;
}

/**
 * 按区块号回填 events 表的时间戳（配合 saveBlockTimestamps 使用）
 */
function updateEventTimestamps(map) {
  const entries = map instanceof Map ? [...map.entries()] : Object.entries(map || {});
  if (entries.length === 0) return;
  const stmt = sqlite.prepare("UPDATE events SET timestamp = ? WHERE blockNumber = ?");
  sqlite.transaction((list) => {
    for (const [blockNumber, timestamp] of list) {
      stmt.run(Number(timestamp), Number(blockNumber));
    }
  })(entries);
}

// ======================== 后台管理员 ========================

/**
 * 创建管理员（已存在则忽略）
 * @returns {boolean} 是否真正创建
 */
function ensureAdminUser(username, password) {
  const hash = bcrypt.hashSync(password, 10);
  const info = sqlite
    .prepare(
      "INSERT OR IGNORE INTO admin_users(username, password_hash, role, created_at) VALUES(?, ?, 'admin', ?)"
    )
    .run(username, hash, Math.floor(Date.now() / 1000));
  return info.changes > 0;
}

function findAdminUser(username) {
  return sqlite
    .prepare("SELECT * FROM admin_users WHERE username = ?")
    .get(username) || null;
}

/**
 * 引导管理员：admin_users 表为空时用环境变量账号创建
 * @returns {boolean} 是否创建了引导账号
 */
function ensureBootstrap() {
  const count = sqlite.prepare("SELECT COUNT(*) AS c FROM admin_users").get().c;
  if (count > 0) return false;
  ensureAdminUser(config.bootstrapAdminUsername, config.bootstrapAdminPassword);
  logger.info(`已创建引导管理员账号: ${config.bootstrapAdminUsername}`);
  return true;
}

// ======================== 操作日志 ========================

const stmtInsertAdminLog = sqlite.prepare(`
  INSERT INTO admin_logs(username, action, target, detail, tx_hash, ip, created_at)
  VALUES(@username, @action, @target, @detail, @txHash, @ip, @createdAt)
`);

function insertAdminLog({ username, action, target = null, detail = null, txHash = null, ip = null }) {
  const info = stmtInsertAdminLog.run({
    username: username || null,
    action: action || null,
    target: target !== undefined && target !== null ? String(target) : null,
    detail: detail !== undefined && detail !== null ? String(detail) : null,
    txHash: txHash || null,
    ip: ip || null,
    createdAt: Math.floor(Date.now() / 1000),
  });
  return info.lastInsertRowid;
}

function getAdminLogs({ page = 1, limit = 20 } = {}) {
  ({ page, limit } = normalizePage(page, limit));
  const total = sqlite.prepare("SELECT COUNT(*) AS c FROM admin_logs").get().c;
  const rows = sqlite
    .prepare("SELECT * FROM admin_logs ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(limit, (page - 1) * limit);
  const items = rows.map((row) => ({
    id: row.id,
    username: row.username,
    action: row.action,
    target: row.target,
    detail: row.detail,
    txHash: row.tx_hash,
    ip: row.ip,
    createdAt: row.created_at,
    createdAtISO: row.created_at ? new Date(row.created_at * 1000).toISOString() : null,
  }));
  return { items, total, page, limit };
}

// ======================== 用户备注 ========================

function getUserRemark(address) {
  const row = sqlite
    .prepare("SELECT remark FROM user_remarks WHERE LOWER(address) = LOWER(?)")
    .get(address);
  return row ? row.remark : "";
}

function setUserRemark(address, remark) {
  const stmt = sqlite.prepare(`
    INSERT INTO user_remarks(address, remark, updated_at)
    VALUES(LOWER(?), ?, ?)
    ON CONFLICT(address) DO UPDATE SET remark = excluded.remark, updated_at = excluded.updated_at
  `);
  stmt.run(address, String(remark || ""), Math.floor(Date.now() / 1000));
}

module.exports = {
  insertEvent,
  getEventsByUser,
  getEventsByType,
  getRegisteredUsers,
  countRegistered,
  getTodayStats,
  sumInvestedBetween,
  sumUserInvestedSince,
  getAllUserAddresses,
  setScanState,
  getScanState,
  saveBlockTimestamps,
  getBlockTimestamp,
  updateEventTimestamps,
  ensureAdminUser,
  findAdminUser,
  ensureBootstrap,
  insertAdminLog,
  getAdminLogs,
  getUserRemark,
  setUserRemark,
};
