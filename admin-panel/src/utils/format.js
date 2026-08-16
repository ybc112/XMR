import dayjs from 'dayjs';
import { formatEther } from 'ethers';

// 事件类型中文映射
export const EVENT_TYPE_LABELS = {
  Registered: '注册',
  Invested: '投资',
  StaticRewardClaimed: '静态收益',
  GenerationReward: '推荐奖',
  TeamReward: '团队奖',
  FlashExchanged: '闪兑',
  USDTWithdrawn: 'USDT提现',
  XMRWithdrawalRequested: 'XMR提现申请',
  XMRWithdrawalProcessed: 'XMR提现到账',
  XMRAddressSet: '绑定XMR地址',
  UserComputingPowerSet: '设置算力',
  BalanceAdjusted: '调整余额',
  AdminUpdated: '管理员变更',
  DailyRateUpdated: '日化率变更',
  ComputingPowerUpdated: '算力变更',
  XMRPriceUpdated: '价格变更',
  LevelUpdated: '等级变更',
  Paused: '暂停',
  Unpaused: '恢复',
  Exited: '出局',
};

// 日志动作中文映射（未命中则显示原文）
export const ACTION_LABELS = {
  login: '登录',
  logout: '退出登录',
  set_xmr_price: '设置XMR价格',
  set_daily_rate: '设置日化率',
  set_computing_power: '设置全局算力',
  set_withdraw_fee: '设置提现费率',
  emergency_pause: '紧急暂停',
  emergency_unpause: '恢复运行',
  set_user_computing_power: '设置用户算力',
  adjust_balance: '调整余额',
  blacklist: '黑名单变更',
  process_xmr_withdrawal: '处理XMR提现',
  multisig_confirm: '多签确认',
  multisig_revoke: '多签撤销',
  multisig_execute: '多签执行',
  ...EVENT_TYPE_LABELS,
};

export function eventLabel(type) {
  return EVENT_TYPE_LABELS[type] || type || '-';
}

export function actionLabel(action) {
  return ACTION_LABELS[action] || action || '-';
}

// 资金方向（收入/支出/中性）
const IN_EVENTS = new Set([
  'StaticRewardClaimed',
  'GenerationReward',
  'TeamReward',
  'XMRWithdrawalProcessed',
]);
const OUT_EVENTS = new Set([
  'Invested',
  'USDTWithdrawn',
  'XMRWithdrawalRequested',
  'FlashExchanged',
  'Exited',
]);

export function eventDirection(type) {
  if (IN_EVENTS.has(type)) return 'in';
  if (OUT_EVENTS.has(type)) return 'out';
  return 'none';
}

export function eventTagColor(type) {
  const d = eventDirection(type);
  if (d === 'in') return 'green';
  if (d === 'out') return 'red';
  if (type === 'Registered') return 'blue';
  if (type === 'UserComputingPowerSet' || type === 'BalanceAdjusted') return 'orange';
  if (type === 'Paused') return 'red';
  if (type === 'Unpaused') return 'green';
  return 'default';
}

// 等级 Tag 颜色（M1-M9 渐变色系）
const LEVEL_TAG_COLORS = [
  'default',
  'magenta',
  'purple',
  'geekblue',
  'blue',
  'cyan',
  'green',
  'lime',
  'gold',
  'orange',
  'volcano',
  'red',
];

export function levelColor(level) {
  const n = Number(level);
  return LEVEL_TAG_COLORS[Math.min(Math.max(n, 0), LEVEL_TAG_COLORS.length - 1)] || 'default';
}

// 地址缩写 0x1234…abcd
export function formatAddr(addr, head = 6, tail = 4) {
  if (addr === null || addr === undefined || addr === '') return '-';
  const s = String(addr);
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function groupThousands(intStr) {
  const neg = intStr.startsWith('-');
  const digits = neg ? intStr.slice(1) : intStr;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped;
}

function trimDecimal(s, digits = 4) {
  if (s === '' || s === null || s === undefined || s === 'NaN') return '-';
  if (!s.includes('.')) return groupThousands(s);
  const [i, d] = s.split('.');
  let dd = d.slice(0, digits).replace(/0+$/, '');
  return groupThousands(i) + (dd ? '.' + dd : '');
}

// 金额格式化：输入 wei（整数/bigint）会被 ether 化；输入已是 ether 的小数字符串则原样截断保留 4 位
export function formatAmount(v, digits = 4) {
  if (v === null || v === undefined || v === '') return '-';
  const s = String(v);
  try {
    return trimDecimal(formatEther(BigInt(s)), digits);
  } catch {
    return trimDecimal(s, digits);
  }
}

// 已是 ether 单位的字符串直接格式化（千分位 + 最多 4 位小数）
export function formatEtherDisplay(v, digits = 4) {
  if (v === null || v === undefined || v === '') return '-';
  return trimDecimal(String(v), digits);
}

// 时间格式化：秒级时间戳 → YYYY-MM-DD HH:mm
export function formatSec(sec) {
  if (!sec && sec !== 0) return '-';
  return dayjs.unix(Number(sec)).format('YYYY-MM-DD HH:mm');
}

// 毫秒级时间戳 → YYYY-MM-DD HH:mm:ss
export function formatMs(ms) {
  if (!ms && ms !== 0) return '-';
  return dayjs(Number(ms)).format('YYYY-MM-DD HH:mm:ss');
}

// ISO 字符串 → YYYY-MM-DD HH:mm
export function formatISO(iso) {
  if (!iso) return '-';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(iso);
}

// 复制到剪贴板（clipboard API + execCommand 兜底）
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export const BSCSCAN_TX = (hash) => `https://testnet.bscscan.com/tx/${hash}`;
