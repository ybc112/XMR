// 合约地址配置 (BSC链)
// 注意: StakingDApp 和 XMRToken 为占位地址，部署后替换为真实地址
export const CONTRACT_ADDRESSES = {
  StakingDApp: '0x0000000000000000000000000000000000000000',
  XMRToken: '0x0000000000000000000000000000000000000001',
  MultiSigWallet: '0x0000000000000000000000000000000000000002',
  USDT: '0x55d398326f99059fF775485246999027B3197955'
}

// BSC 主网配置
export const NETWORK_CONFIG = {
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
    'https://bsc-dataseed1.ninicoin.io',
    'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3',
    'https://bnb-mainnet.g.alchemy.com/v2/demo'
  ],
  blockExplorerUrls: ['https://bscscan.com']
}

// BSC 测试网配置 (可选，用于测试)
export const TESTNET_CONFIG = {
  chainId: '0x61', // 97 in hex
  chainName: 'BNB Smart Chain Testnet',
  nativeCurrency: {
    name: 'tBNB',
    symbol: 'tBNB',
    decimals: 18
  },
  rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
  blockExplorerUrls: ['https://testnet.bscscan.com']
}

// USDT 精度 (BSC上的USDT使用18位精度)
export const USDT_DECIMALS = 18

// 链上 explorer
export const BSC_EXPLORER = 'https://bscscan.com'
