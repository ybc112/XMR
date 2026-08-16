// StakingDApp 合约 ABI
export const STAKING_DAPP_ABI = [
  // 用户操作
  'function register(address _referrer) external',
  'function invest(uint256 _amount) external',
  'function claimStaticReward() external',
  'function flashExchange(uint256 _xmrAmount) external',
  'function withdrawUSDT(uint256 _amount) external',
  'function requestXMRWithdrawal(uint256 _amount) external',
  'function setXMRAddress(string calldata _addr) external',

  // 查询函数
  'function getUserInfo(address _user) external view returns (tuple(address referrer, uint256 personalAmount, uint256 totalEarned, uint256 exitLimit, bool isBlacklisted, bool isRegistered, bool exited, uint8 level, uint256 pendingUSDT, uint256 pendingXMR, uint256 teamTotalVolume, uint256 maxAreaVolume, uint256 memberId, uint256 xmrWithdrawalPending, string xmrAddress))',
  'function getContractStats() external view returns (tuple(uint256 totalUsers, uint256 totalUSDTDeposited, uint256 xmrPrice, uint256 dailyRate, uint256 computingPower, uint256 withdrawFee, bool paused, uint256 contractUSDTBalance, uint256 contractXMRBalance))',
  'function getDirectReferrals(address _user) external view returns (address[])',
  'function getDirectReferralCount(address _user) external view returns (uint256)',
  'function getRemainingExitLimit(address _user) external view returns (uint256)',
  'function getSubAreaVolume(address _user) external view returns (uint256)',
  'function estimateStaticReward(address _user) external view returns (uint256 usdtValue, uint256 xmrValue)',
  'function getLevelInfo(uint8 _level) external view returns (uint256, uint256, uint256)',

  // 公共状态变量
  'function admins(address) view returns (bool)',
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function dailyRate() view returns (uint256)',
  'function computingPower() view returns (uint256)',
  'function withdrawFee() view returns (uint256)',
  'function xmrPrice() view returns (uint256)',
  'function totalUsers() view returns (uint256)',
  'function totalUSDTDeposited() view returns (uint256)',
  'function nextMemberId() view returns (uint256)',
  'function usdtToken() view returns (address)',
  'function xmrToken() view returns (address)',
  'function xmrAddress(address) view returns (string)',
  'function userComputingPower(address) view returns (uint256)',
  'function MIN_INVESTMENT() view returns (uint256)',
  'function WITHDRAW_UNIT() view returns (uint256)',

  // 管理函数
  'function dailySettlement(uint256 _xmrPrice) external',
  'function setXMRPrice(uint256 _price) external',
  'function processXMRWithdrawal(address _user) external',
  'function setDailyRate(uint256 _rate) external',
  'function setComputingPower(uint256 _power) external',
  'function setUserComputingPower(address _user, uint256 _power) external',
  'function adjustUserUSDT(address _user, int256 _delta) external',
  'function adjustUserXMR(address _user, int256 _delta) external',
  'function setWithdrawFee(uint256 _fee) external',
  'function setBlacklist(address _user, bool _status) external',
  'function emergencyPause() external',
  'function emergencyUnpause() external',
  'function addAdmin(address _admin) external',
  'function removeAdmin(address _admin) external',
  'function setLevelThresholds(uint8 _index, uint256 _personalRequired, uint256 _subAreaRequired, uint256 _teamRate) external',
  'function setGenerationRate(uint8 _generation, uint256 _rate) external',
  'function withdrawFees(address _to, uint256 _amount) external',
  'function withdrawToken(address _token, address _to, uint256 _amount) external',
  'function transferOwnership(address) external',

  // 事件
  'event Registered(address indexed user, address indexed referrer, uint256 memberId)',
  'event Invested(address indexed user, uint256 amount, uint256 totalPersonal)',
  'event StaticRewardClaimed(address indexed user, uint256 usdtValue, uint256 xmrAmount)',
  'event FlashExchanged(address indexed user, uint256 xmrAmount, uint256 usdtAmount)',
  'event USDTWithdrawn(address indexed user, uint256 amount, uint256 fee)',
  'event XMRWithdrawalRequested(address indexed user, uint256 amount, uint256 fee, string xmrAddr)',
  'event XMRWithdrawalProcessed(address indexed user, uint256 amount)',
  'event XMRAddressSet(address indexed user, string xmrAddr)',
  'event UserComputingPowerSet(address indexed user, uint256 power)',
  'event BalanceAdjusted(address indexed user, string kind, int256 delta, address operator)',
  'event DailySettlement(uint256 day, uint256 xmrPrice)',
  'event Paused()',
  'event Unpaused()',
  'event AdminUpdated(address indexed admin, bool status)',
  'event BlacklistUpdated(address indexed user, bool status)',
  'event DailyRateUpdated(uint256 oldRate, uint256 newRate)',
  'event ComputingPowerUpdated(uint256 oldPower, uint256 newPower)',
  'event XMRPriceUpdated(uint256 oldPrice, uint256 newPrice)',
  'event LevelUpdated(address indexed user, uint8 oldLevel, uint8 newLevel)',
  'event GenerationReward(address indexed receiver, address indexed investor, uint8 generation, uint256 amount)',
  'event TeamReward(address indexed receiver, address indexed investor, uint8 level, uint256 amount)',
  'event Exited(address indexed user, uint256 totalEarned)'
]

// XMRToken (ERC20) 合约 ABI
export const XMR_TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
]

// USDT (ERC20) 合约 ABI - 与XMRToken相同的ERC20接口
export const USDT_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
]

// MultiSigWallet 合约 ABI
export const MULTISIG_WALLET_ABI = [
  'function submitTransaction(address destination, uint256 value, bytes data) returns (uint256)',
  'function confirmTransaction(uint256 txId)',
  'function revokeConfirmation(uint256 txId)',
  'function executeTransaction(uint256 txId)',
  'function addOwner(address owner)',
  'function removeOwner(address owner)',
  'function changeRequirement(uint256 _required)',
  'function getOwners() view returns (address[])',
  'function getTransactionCount(bool pending, bool executed) view returns (uint256)',
  'function getTransaction(uint256 txId) view returns (address, uint256, bytes, bool, uint256)',
  'function isOwner(address) view returns (bool)',
  'function required() view returns (uint256)',
  'function transactionCount() view returns (uint256)',
  'function confirmations(uint256 txId, address owner) view returns (bool)',
  'event SubmitTransaction(address indexed owner, uint256 indexed txId, address destination, uint256 value, bytes data)',
  'event ConfirmTransaction(address indexed owner, uint256 indexed txId)',
  'event RevokeConfirmation(address indexed owner, uint256 indexed txId)',
  'event ExecuteTransaction(address indexed owner, uint256 indexed txId)'
]

// 导出所有 ABI 的集合
export const ABIS = {
  StakingDApp: STAKING_DAPP_ABI,
  XMRToken: XMR_TOKEN_ABI,
  USDT: USDT_ABI,
  MultiSigWallet: MULTISIG_WALLET_ABI
}
