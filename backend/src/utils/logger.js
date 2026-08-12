/**
 * 日志工具
 * 简单的控制台日志，带时间戳和级别标签
 */

const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVELS.INFO;

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, message, meta) {
  const parts = [`[${timestamp()}] [${level}]`];
  if (typeof message === "string") {
    parts.push(message);
  } else {
    parts.push(JSON.stringify(message));
  }
  if (meta !== undefined) {
    parts.push(JSON.stringify(meta));
  }
  return parts.join(" ");
}

const logger = {
  debug(message, meta) {
    if (currentLevel <= LEVELS.DEBUG) {
      console.debug(formatMessage("DEBUG", message, meta));
    }
  },

  info(message, meta) {
    if (currentLevel <= LEVELS.INFO) {
      console.info(formatMessage("INFO", message, meta));
    }
  },

  warn(message, meta) {
    if (currentLevel <= LEVELS.WARN) {
      console.warn(formatMessage("WARN", message, meta));
    }
  },

  error(message, meta) {
    if (currentLevel <= LEVELS.ERROR) {
      console.error(formatMessage("ERROR", message, meta));
    }
  },
};

module.exports = logger;
