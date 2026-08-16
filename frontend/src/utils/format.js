import { ethers } from 'ethers'
import { BSC_EXPLORER } from '../config/contracts.js'

/**
 * 安全解析数字：对 NaN/Infinity/非法字符串返回 0
 */
export function safeParseFloat(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue
  try {
    const num = typeof value === 'bigint'
      ? parseFloat(formatEther(value))
      : parseFloat(String(value).toString().replace(/,/g, ''))
    return Number.isFinite(num) ? num : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * 安全转 Number：对 BigInt 使用 formatEther，对非法值返回 0
 */
export function safeNumber(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue
  try {
    if (typeof value === 'bigint') {
      return parseFloat(formatEther(value))
    }
    const num = Number(value)
    return Number.isFinite(num) ? num : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * 格式化地址：显示前6位...后4位
 */
export function formatAddress(address) {
  if (!address) return ''
  if (address.length < 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * 格式化金额：从 wei 转为可读数字，保留4位小数
 */
export function formatEther(amount) {
  if (!amount) return '0.0000'
  try {
    const formatted = ethers.formatEther(amount)
    return parseFloat(formatted).toFixed(4)
  } catch {
    return '0.0000'
  }
}

/**
 * 格式化金额（带千分位分隔符）
 */
export function formatNumber(amount, decimals = 4) {
  if (!amount) return '0.0000'
  try {
    const num = typeof amount === 'bigint' ? parseFloat(ethers.formatEther(amount)) : parseFloat(amount)
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  } catch {
    return '0.0000'
  }
}

/**
 * 格式化百分比
 */
export function formatPercent(value, decimals = 2) {
  if (!value) return '0.00%'
  const num = typeof value === 'bigint' ? parseFloat(ethers.formatEther(value)) : parseFloat(value)
  return `${num.toFixed(decimals)}%`
}

/**
 * 格式化日期时间
 */
export function formatDateTime(timestamp) {
  if (!timestamp) return '-'
  try {
    const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp
    const date = new Date(ts * 1000)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '-'
  }
}

/**
 * 格式化日期
 */
export function formatDate(timestamp) {
  if (!timestamp) return '-'
  try {
    const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp
    const date = new Date(ts * 1000)
    return date.toLocaleDateString('zh-CN')
  } catch {
    return '-'
  }
}

/**
 * 将输入的字符串金额转为 wei (BigInt)
 */
export function parseEther(amount) {
  if (!amount || amount === '') return 0n
  try {
    return ethers.parseEther(amount.toString())
  } catch {
    return 0n
  }
}

/**
 * 短地址复制文本
 */
export function shortHash(hash, length = 10) {
  if (!hash) return ''
  if (hash.length <= length * 2) return hash
  return `${hash.slice(0, length)}...${hash.slice(-6)}`
}

/**
 * 等级名称映射
 */
export function getLevelName(level) {
  const levelNum = typeof level === 'bigint' ? Number(level) : level
  const names = ['普通会员', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9']
  return names[levelNum] || `M${levelNum}`
}

/**
 * 格式化交易哈希链接
 */
export function getTxHashUrl(txHash) {
  return `${BSC_EXPLORER}/tx/${txHash}`
}

/**
 * 格式化地址链接
 */
export function getAddressUrl(address) {
  return `${BSC_EXPLORER}/address/${address}`
}

/**
 * 格式化实际日化率
 * 合约里 dailyRate / computingPower 都是整数基点，不是 wei：
 *   effectiveRate = dailyRate * computingPower / 100   (基点, 10000 = 100%)
 * 默认 dailyRate=100, computingPower=100 -> 1% 日化
 */
export function formatDailyRate(dailyRate, computingPower, decimals = 2) {
  if (dailyRate === undefined || dailyRate === null) return '0.00%'
  try {
    const rate = Number(dailyRate)
    const power = computingPower === undefined || computingPower === null ? 100 : Number(computingPower)
    const effective = (rate * power) / 100
    return `${(effective / 100).toFixed(decimals)}%`
  } catch {
    return '0.00%'
  }
}

/**
 * 格式化基点比率 (10000 = 100%)，用于提现费率等
 */
export function formatBasisPoints(bps, decimals = 2) {
  if (bps === undefined || bps === null) return '0.00%'
  try {
    return `${(Number(bps) / 100).toFixed(decimals)}%`
  } catch {
    return '0.00%'
  }
}

// 合约 require 消息 -> 中文提示
const CONTRACT_ERROR_MAP = {
  'Already registered': '该钱包已经注册过了',
  'Cannot refer self': '不能填写自己的地址作为推荐人',
  'Referrer not registered': '推荐人尚未注册，第一个用户请将推荐人留空',
  'Not registered': '请先完成注册',
  'Amount must be > 0': '金额必须大于 0',
  'Below minimum investment': '低于最低投资金额（100 USDT）',
  'Contract is paused': '合约已暂停，请稍后再试',
  'User is blacklisted': '该地址已被限制操作',
  'Not admin': '需要管理员权限',
  'Already claimed today': '今天已经领取过了',
  'No reward available': '当前没有可领取的收益',
  'Insufficient balance': '余额不足',
  'Below minimum withdrawal': '低于最低提现数量',
  'Rate exceeds 100%': '比例不能超过 100%',
  'User has exited': '您已达到 3 倍出局上限，请重新投资',
  'Investment below 100 USDT': '最低投资 100 USDT',
  'Investment must be multiple of 100': '投资金额必须是 100 的整数倍',
  'Withdrawal must be multiple of 10': '提现金额必须是 10 的整数倍',
  'XMR address not set': '请先添加 XMR 收款地址',
  'Invalid XMR address length': 'XMR 收款地址长度不正确',
  'Power too high': '算力值超出上限'
}

/**
 * 把 ethers 抛出的合约错误翻译成可读中文
 * 处理 CALL_EXCEPTION / missing revert data 这类原始报错
 */
export function parseContractError(err, fallback = '操作失败') {
  if (!err) return fallback

  // 用户在钱包里取消
  if (err.code === 'ACTION_REJECTED' || err.code === 4001) return '您取消了交易'

  const raw = [err.reason, err.shortMessage, err.info?.error?.message, err.message]
    .filter(Boolean)
    .join(' | ')

  for (const [key, msg] of Object.entries(CONTRACT_ERROR_MAP)) {
    if (raw.includes(key)) return msg
  }

  if (err.code === 'INSUFFICIENT_FUNDS' || raw.includes('insufficient funds')) {
    return 'BNB 余额不足，无法支付 gas 费'
  }

  // estimateGas 阶段被 revert 但没带 revert reason
  if (raw.includes('missing revert data') || err.code === 'CALL_EXCEPTION') {
    return '交易会被合约拒绝，请检查填写的信息与账户状态是否满足条件'
  }

  if (err.code === 'NETWORK_ERROR' || raw.includes('timeout') || raw.includes('ETIMEDOUT')) {
    return '网络连接超时，请稍后重试'
  }

  return err.reason || err.shortMessage || fallback
}
