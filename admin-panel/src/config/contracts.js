import { ethers } from 'ethers';

export const STAKING_ADDRESS = '0x2a74f3dEA47640e5cBEbfCb69E61A82c628327B0';
export const MULTISIG_ADDRESS = '0xeee8415C2F13FF7C39f51Ba0cf81794878F06Fb0';

export const BSC_TESTNET = {
  chainId: '0x61',
  chainName: 'BSC Testnet',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: ['https://bsc-testnet.publicnode.com'],
  blockExplorerUrls: ['https://testnet.bscscan.com'],
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

export const MULTISIG_ABI = ['function isOwner(address) view returns (bool)'];

export function shortenAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function txErrorMessage(e) {
  const m = String(e?.shortMessage || e?.info?.error?.message || e?.message || '');
  if (/user rejected|rejected the request/i.test(m)) return '您在钱包中取消了签名';
  if (/only ?owner|only ?admin/i.test(m)) return '当前钱包不是合约管理员，无法执行该操作';
  if (/insufficient funds|gas required exceeds/i.test(m)) return '钱包 tBNB 不足，请先充值 gas';
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
