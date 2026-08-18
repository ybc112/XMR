import { ethers } from 'ethers';

export const STAKING_ADDRESS = '0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F';
export const MULTISIG_ADDRESS = '0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f';

export const BSC_MAINNET = {
  chainId: '0x38',
  chainName: 'BSC Mainnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
  blockExplorerUrls: ['https://bscscan.com'],
};

export const STAKING_ABI = [
  'function processXMRWithdrawal(address _user) external',
  'function adjustUserUSDT(address _user, int256 _delta) external',
  'function adjustUserXMR(address _user, int256 _delta) external',
  'function setBlacklist(address _user, bool _status) external',
  'function setWithdrawFee(uint256 _fee) external',
  'function setXMRPrice(uint256 _price) external',
  'function dailySettlement(uint256 _xmrPrice) external',
  'function emergencyPause() external',
  'function emergencyUnpause() external',
  'function admins(address) view returns (bool)',
  'function owner() view returns (address)',
];

export const MULTISIG_ABI = [
  'function isOwner(address) view returns (bool)',
  'function submitTransaction(address destination, uint256 value, bytes data) returns (uint256)',
  'function confirmTransaction(uint256 txId)',
  'function executeTransaction(uint256 txId)',
  'function transactionCount() view returns (uint256)',
];

export function shortenAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function txErrorMessage(e) {
  const m = String(e?.shortMessage || e?.info?.error?.message || e?.message || '');
  if (/user rejected|rejected the request/i.test(m)) return '您在钱包中取消了签名';
  if (/OwnableUnauthorizedAccount|only ?owner|unknown custom error/i.test(m)) {
    return '权限不足：该操作仅限多签 owner 通过「多签提交」执行。请切换到 owner 钱包，或在未连接钱包模式下由后端提交多签（需 2/3 确认）。';
  }
  if (/only ?admin|not admin/i.test(m)) return '当前钱包不是合约管理员，无法执行该操作';
  if (/insufficient funds|gas required exceeds|underpriced/i.test(m)) return '钱包 BNB 不足，请先充值 gas';
  if (/no pending/i.test(m)) return '该用户链上已无待处理提现，请刷新列表';
  if (/network changed|underlying network/i.test(m)) return '网络切换中，请重试';
  return m || '交易发送失败';
}

export async function sendTx(call) {
  const tx = await call();
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error('交易执行失败（reverted）');
  return receipt;
}
