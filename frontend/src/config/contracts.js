// 合约地址配置 (BSC 测试网, chainId 97)
// 2026-08-14 测试网部署 v2（团队奖改为静态收益基数 + 会员 ID 随机化）
// 部署记录: deploy-state-testnet.json
export const CONTRACT_ADDRESSES = {
  StakingDApp: '0xdb29E9eB1149d33E0979285eacf56572fACA62C9',
  XMRToken: '0x7A4b49cCAaDF69C4FCfd2223F8E3e30dAAb9F123',
  MultiSigWallet: '0xAEb8B096a717AeF05F169707968623C2c9F97650',
  USDT: '0x7BA7b94d0c55A6761bA8bFdE079a934631f656c7' // MockUSDT（测试 U，公开 mint）
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
