// 合约地址配置 (BSC 主网, chainId 56)
// 2026-08-18 主网正式部署（收益结算 24h 周期锚定北京12:00，日化率锁定1%）
// 部署记录: deploy-state-mainnet.json
export const CONTRACT_ADDRESSES = {
  StakingDApp: '0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F',
  XMRToken: '0x6b4B901c5F41b843F91CAbF142738Af95690B2F8',
  MultiSigWallet: '0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f',
  USDT: '0x55d398326f99059fF775485246999027B3197955' // BSC 官方 USDT
}

// 当前网络配置：BSC 主网
export const NETWORK_CONFIG = {
  chainId: '0x38', // 56 in hex
  chainName: 'BNB Smart Chain',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18
  },
  rpcUrls: [
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-dataseed1.bnbchain.org',
    'https://bsc-dataseed2.bnbchain.org',
    'https://bsc-dataseed3.bnbchain.org'
  ],
  blockExplorerUrls: ['https://bscscan.com']
}

// USDT 精度 (BSC上的USDT使用18位精度)
export const USDT_DECIMALS = 18

// 链上 explorer (当前主网)
export const BSC_EXPLORER = 'https://bscscan.com'

// 后端 API 地址（资金明细等只读数据走后端缓存）
// 生产（HTTPS）默认用相对路径，由 nginx 将 /api/* 转发到后端，避免混合内容拦截
// 可用 VITE_API_BASE_URL 覆盖（如 https://api.example.com）
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '')
