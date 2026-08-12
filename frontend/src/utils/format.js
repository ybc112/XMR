import { ethers } from 'ethers'

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
  return `https://bscscan.com/tx/${txHash}`
}

/**
 * 格式化地址链接
 */
export function getAddressUrl(address) {
  return `https://bscscan.com/address/${address}`
}
