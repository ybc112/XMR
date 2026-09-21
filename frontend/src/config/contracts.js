// 合约地址配置
// 通过构建/部署环境变量 VITE_CHAIN 选择网络：'testnet' | 'mainnet'（默认 mainnet 生产）
// 例：VITE_CHAIN=testnet npm run build  -> 打包指向 BSC 测试网
const CHAIN = import.meta.env.VITE_CHAIN || 'mainnet'

// BSC 主网 (chainId 56) — 2026-08 主网部署（收益结算 24h 周期锚定北京12:00，日化率锁定1%）
// 2026-09 迁移至新合约（含「直推N人解锁N代」层级奖励规则，用户数据已迁移）
const MAINNET_ADDRESSES = {
  StakingDApp: '0x7647bFBbC6164b5543a77b55a1d2216B39157d24',
  XMRToken: '0x887A7E986A137dB022677206e6E8b0010BAe6BaA',
  MultiSigWallet: '0x8f04cCC650798724B37E8f72f9f9D90Ee5e9F228',
  USDT: '0x55d398326f99059fF775485246999027B3197955' // BSC 官方 USDT
}

// BSC 测试网 (chainId 97) — 2026-09-21 每周期=1天 + 2 分钟结算周期版本部署（100U/周期得 1U）
// 部署记录: deploy-state-testnet.json；USDT 为公开 mint 的 MockUSDT
const TESTNET_ADDRESSES = {
  StakingDApp: '0x8a4a5e7669E4D2843CDd298bcA4674DA8B74ee83',
  XMRToken: '0x796C2456064EcC028b87E81dcDf4617eE510e6F5',
  MultiSigWallet: '0x66B2Ce2Cb4B15Aa9286EAbC5286cF9Efab6617B3',
  USDT: '0x2B08e8B8AB52CD4E0579aE45644E98A75129A65f'
}

export const CONTRACT_ADDRESSES = CHAIN === 'testnet' ? TESTNET_ADDRESSES : MAINNET_ADDRESSES

// 当前网络配置
export const NETWORK_CONFIG = CHAIN === 'testnet'
  ? {
      chainId: '0x61', // 97 in hex
      chainName: 'BNB Smart Chain Testnet',
      nativeCurrency: {
        name: 'tBNB',
        symbol: 'tBNB',
        decimals: 18
      },
      rpcUrls: [
        'https://bsc-testnet.bnbchain.org',
        'https://bsc-testnet.publicnode.com'
      ],
      blockExplorerUrls: ['https://testnet.bscscan.com']
    }
  : {
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

// 链上 explorer（与所选网络一致）
export const BSC_EXPLORER = CHAIN === 'testnet' ? 'https://testnet.bscscan.com' : 'https://bscscan.com'

// 后端 API 地址（资金明细等只读数据走后端缓存）
// 生产（HTTPS）默认用相对路径，由 nginx 将 /api/* 转发到后端，避免混合内容拦截
// 可用 VITE_API_BASE_URL 覆盖（如 https://api.example.com）
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '')
