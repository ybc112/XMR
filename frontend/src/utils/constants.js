export const NAV_ITEMS = [
  { path: '/', label: '仪表盘', icon: 'dashboard' },
  { path: '/staking', label: '算力', icon: 'staking' },
  { path: '/team', label: '团队', icon: 'team' },
  { path: '/exchange', label: '闪兑', icon: 'exchange' },
  { path: '/assets', label: '资产', icon: 'assets' },
  { path: '/admin', label: '管理', icon: 'admin', adminOnly: true }
]

// 等级要求与链上 StakingDApp 构造函数 levels[0..8] 保持一致
// 考核维度：个人业绩(personalRequired) + 小区业绩(subAreaRequired)；奖励为团队收益的百分比(teamRate)
export const LEVEL_INFO = [
  { level: 0, name: '普通会员', personalReq: 0, subAreaReq: 0, rewardRate: 0 },
  { level: 1, name: 'M1', personalReq: 200, subAreaReq: 5000, rewardRate: 5 },
  { level: 2, name: 'M2', personalReq: 500, subAreaReq: 20000, rewardRate: 10 },
  { level: 3, name: 'M3', personalReq: 1000, subAreaReq: 80000, rewardRate: 15 },
  { level: 4, name: 'M4', personalReq: 2000, subAreaReq: 200000, rewardRate: 20 },
  { level: 5, name: 'M5', personalReq: 3000, subAreaReq: 500000, rewardRate: 25 },
  { level: 6, name: 'M6', personalReq: 5000, subAreaReq: 1000000, rewardRate: 30 },
  { level: 7, name: 'M7', personalReq: 10000, subAreaReq: 2000000, rewardRate: 35 },
  { level: 8, name: 'M8', personalReq: 15000, subAreaReq: 5000000, rewardRate: 40 },
  { level: 9, name: 'M9', personalReq: 20000, subAreaReq: 10000000, rewardRate: 45 }
]

export const GENERATION_RATES = [
  { generation: 1, rate: 10 },
  { generation: 2, rate: 3 },
  { generation: 3, rate: 2 },
  { generation: 4, rate: 1 },
  { generation: 5, rate: 1 },
  { generation: 6, rate: 1 },
  { generation: 7, rate: 1 },
  { generation: 8, rate: 1 },
  { generation: 9, rate: 1 },
  { generation: 10, rate: 1 },
  { generation: 11, rate: 1 },
  { generation: 12, rate: 1 }
]

export const COLORS = {
  PRIMARY: '#0F172A',
  GOLD: '#B8860B',
  GOLD_LIGHT: '#D4A72B',
  BLUE: '#3B82F6',
  GREEN: '#10B981',
  AMBER: '#F59E0B',
  RED: '#EF4444',
  TEXT_MAIN: '#1E293B',
  TEXT_SUB: '#64748B',
  BORDER: '#E2E8F0',
  BG_MAIN: '#FDFBF7',
  BG_CARD: '#FFFFFF'
}

export const TX_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed'
}

export const DEFAULT_REFERRER = '0x0000000000000000000000000000000000000000'

export const MAX_APPROVE_AMOUNT = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

export const PAGE_TITLES = {
  '/': '仪表盘',
  '/staking': '算力',
  '/team': '团队',
  '/exchange': '闪兑',
  '/assets': '资产',
  '/admin': '管理'
}
