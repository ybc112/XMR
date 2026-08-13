// 合约地址配置 (BSC链)
// 2026-08-13 部署 (部署 tx: deploy-state.json)
export const CONTRACT_ADDRESSES = {
  StakingDApp: '0x5cc87AF28A29363ab3D37f125f5030B44E730311',
  XMRToken: '0x409481A7FF519BF29c6d8D66465527381D4F1b69',
  MultiSigWallet: '0x0E51A79183e701F4a35cD1Cc2655BE35c0e3f0b5',
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
