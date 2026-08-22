/**
 * 时间工具
 * 服务器时区为 UTC，但运营人员按北京时间看数据，
 * 因此「今日」统一以北京时间 00:00 为界（UTC+8）。
 */

const BEIJING_OFFSET_SEC = 8 * 3600;
const DAY_SEC = 24 * 3600;

/**
 * 北京时间今日 00:00 对应的秒级 Unix 时间戳
 * @returns {number}
 */
function startOfBeijingTodaySec() {
  const nowSec = Math.floor(Date.now() / 1000);
  // 平移到北京时区后按天取整，再平移回 UTC 时间戳
  return Math.floor((nowSec + BEIJING_OFFSET_SEC) / DAY_SEC) * DAY_SEC - BEIJING_OFFSET_SEC;
}

module.exports = {
  startOfBeijingTodaySec,
  BEIJING_OFFSET_SEC,
  DAY_SEC,
};
