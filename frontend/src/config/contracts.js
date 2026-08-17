// 合约地址配置 (BSC 测试网, chainId 97)
// 2026-08-17 测试网部署（收益结算优化：锁定1%、自动团队奖、周期结算）
// 部署记录: deploy-state-testnet.json
export const CONTRACT_ADDRESSES = {
  StakingDApp: '0x64eA0e856444386B30966FcC611Da4231f9A1029',
  XMRToken: '0x74FD17a9b935350575f4cE253026182F99aEA099',
  MultiSigWallet: '0x09b13E81C0416Eb47cba00B1e4563aC02e55e575',
  USDT: '0x4c55951011f2B88d00C71733eBfD53cE3a4Dd1c1' // MockUSDT（测试 U，公开 mint）
}

// 当前网络配置：BSC 测试网
export const NETWORK_CONFIG = {
  chainId: '0x61', // 97 in hex
  chainName: 'BNB Smart Chain Testnet',
  nativeCurrency: {
    name: 'tBNB',
    symbol: 'tBNB',
    decimals: 18
  },
  rpcUrls: [
    'https://bsc-testnet.bnbchain.org',
    'https://bsc-testnet.publicnode.com',
    'https://data-seed-prebsc-1-s1.binance.org:8545'
  ],
  blockExplorerUrls: ['https://testnet.bscscan.com']
}

// 主网配置 (可选，切回生产时使用)
export const MAINNET_CONFIG = {
  chainId: '0x38', // 56 in hex
  chainName: 'BNB Smart Chain',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18
  },
  rpcUrls: [
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3',
    'https://bnb-mainnet.g.alchemy.com/v2/demo'
  ],
  blockExplorerUrls: ['https://bscscan.com']
}

// USDT 精度 (BSC上的USDT使用18位精度)
export const USDT_DECIMALS = 18

// 链上 explorer (当前测试网)
export const BSC_EXPLORER = 'https://testnet.bscscan.com'

// 后端 API 地址（资金明细等只读数据走后端缓存）
// 生产（Vercel HTTPS）默认用相对路径，由 vercel.json 将 /api/* 服务端转发到后端，
// 避免浏览器混合内容拦截（HTTPS 页面禁止请求 HTTP 接口）
// 可用 VITE_API_BASE_URL 覆盖（如 https://api.example.com）
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '')
