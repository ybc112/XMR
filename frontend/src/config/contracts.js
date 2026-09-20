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

// BSC 测试网 (chainId 97) — 2026-09-20 多仓位 v6 + 2 分钟结算周期版本部署
// 部署记录: deploy-state-testnet.json；USDT 为公开 mint 的 MockUSDT
const TESTNET_ADDRESSES = {
  StakingDApp: '0x89e491cA1E320a540961e26a4732E61cc09Aa4e1',
  XMRToken: '0x620bEFD96837e80074C8A6912085671bD41948c6',
  MultiSigWallet: '0xc6BF413cE039FDe276413bdf604CC837a339d576',
  USDT: '0x55cb17EE0589C9E1337c1E699AE6Dc1e74592A35'
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
