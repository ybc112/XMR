// 合约地址配置 (BSC 测试网, chainId 97)
// 2026-08-15 测试网部署 v3（ID 容量 100 万、投资 100 倍数、提现 10 倍数、
// XMR 地址绑定、按用户算力、用户余额调整）
// 部署记录: deploy-state-testnet.json
export const CONTRACT_ADDRESSES = {
  StakingDApp: '0xb1748538616222F30E8031e13E14810B8C26B2c3',
  XMRToken: '0x89EBa963BcA8C91502747f4F1528C2A70dB08BeF',
  MultiSigWallet: '0xd47995d173a2fBCF4426aD83eE2F159C8B583295',
  USDT: '0xc19dbe92987AEe44E7A0442807518532ef0A517a' // MockUSDT（测试 U，公开 mint）
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

// 后端 API 地址（资金明细等只读数据走后端缓存；可用 VITE_API_BASE_URL 覆盖）
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
