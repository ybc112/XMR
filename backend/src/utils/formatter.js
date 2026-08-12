/**
 * 格式化工具
 * 提供金额、地址、分页等格式化方法
 */
const { ethers } = require("ethers");

/**
 * 将 wei (BigInt) 格式化为可读的 ether 字符串
 * @param {bigint|string|number} value - wei 值
 * @returns {string} 格式化后的 ether 字符串
 */
function formatEther(value) {
  if (value === null || value === undefined) return "0";
  try {
    return ethers.formatEther(value);
  } catch {
    return "0";
  }
}

/**
 * 将 ether 字符串解析为 wei (BigInt)
 * @param {string} value - ether 字符串
 * @returns {bigint} wei 值
 */
function parseEther(value) {
  return ethers.parseEther(String(value));
}

/**
 * 将原始 uint256 值格式化为带小数位的数字
 * @param {bigint|string|number} value - 原始值
 * @param {number} decimals - 小数位数（默认18）
 * @returns {string} 格式化后的字符串
 */
function formatToken(value, decimals = 18) {
  if (value === null || value === undefined) return "0";
  try {
    return ethers.formatUnits(value, decimals);
  } catch {
    return "0";
  }
}

/**
 * 地址格式化为 checksum 格式
 * @param {string} address - 地址
 * @returns {string} checksum 地址
 */
function formatAddress(address) {
  if (!address) return "";
  try {
    return ethers.getAddress(address);
  } catch {
    return address;
  }
}

/**
 * 将金额格式化为统一返回对象（同时包含原始值和格式化值）
 * @param {bigint|string|number} weiValue - wei 值
 * @param {number} decimals - 小数位数
 * @returns {{ raw: string, formatted: string }}
 */
function formatAmount(weiValue, decimals = 18) {
  return {
    raw: weiValue !== null && weiValue !== undefined ? String(weiValue) : "0",
    formatted: formatToken(weiValue, decimals),
  };
}

/**
 * 从 Express 请求中解析分页参数
 * @param {object} query - req.query 对象
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100; // 最大100条

  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * 构建分页响应对象
 * @param {Array} items - 当前页数据
 * @param {number} total - 总数
 * @param {number} page - 当前页
 * @param {number} limit - 每页条数
 * @returns {{ items: Array, total: number, page: number, limit: number, totalPages: number }}
 */
function buildPagination(items, total, page, limit) {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * 格式化 Unix 时间戳为 ISO 字符串
 * @param {number} timestamp - Unix 时间戳（秒）
 * @returns {string} ISO 字符串
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

module.exports = {
  formatEther,
  parseEther,
  formatToken,
  formatAddress,
  formatAmount,
  parsePagination,
  buildPagination,
  formatTimestamp,
};
