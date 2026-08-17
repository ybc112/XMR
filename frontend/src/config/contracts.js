// 合约地址配置 (BSC 测试网, chainId 97)
// 2026-08-17 测试网重新部署（每周期1%收益 + 自动结算admin）
// 部署记录: deploy-state-testnet.json
export const CONTRACT_ADDRESSES = {
  StakingDApp: '0xBadC64Bb4d773e1C01316ee3d947663fC6Ffe3C0',
  XMRToken: '0xee6584aD5AdCA6Cdd189d242DC1e6d922403dFBc',
  MultiSigWallet: '0x69bFe45AF23A64a7b9A577B2009f8a8C4f7431eC',
  USDT: '0x34cc8041D223571313DCc99d93Ff40EF10658e04' // MockUSDT（测试 U，公开 mint）
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
