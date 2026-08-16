import { Interface, formatEther } from 'ethers';
import { formatAddr } from './format';

// 内置管理函数 human-readable ABI 片段（多签 calldata 解码用）
const FRAGMENTS = [
  'function setUserComputingPower(address user, uint256 power)',
  'function adjustUserUSDT(address user, int256 delta)',
  'function adjustUserXMR(address user, int256 delta)',
  'function setDailyRate(uint256 rate)',
  'function setComputingPower(uint256 power)',
  'function setWithdrawFee(uint256 fee)',
  'function setXMRPrice(uint256 price)',
  'function setBlacklist(address user, bool status)',
  'function addAdmin(address account)',
  'function removeAdmin(address account)',
  'function emergencyPause()',
  'function emergencyUnpause()',
  'function processXMRWithdrawal(address user)',
  'function setLevelThresholds(uint8 a, uint256 b, uint256 c, uint256 d)',
  'function setGenerationRate(uint8 level, uint256 rate)',
  'function withdrawFees(address token, uint256 amount)',
  'function withdrawToken(address token, address to, uint256 amount)',
  'function transferOwnership(address newOwner)',
  'function dailySettlement(uint256 day)',
  'function addOwner(address owner)',
  'function removeOwner(address owner)',
  'function changeRequirement(uint256 required)',
];

// 每个片段一个独立 Interface，逐个尝试解码
const INTERFACES = FRAGMENTS.map((fragment) => new Interface([fragment]));

const WEI_THRESHOLD = 10n ** 15n; // >1e15 视为 wei，按 ether 格式化

function formatParam(value, param) {
  try {
    if (param.type === 'address') return formatAddr(String(value), 6, 4);
    if (param.type === 'bool') return value ? 'true' : 'false';
    if (param.type.startsWith('uint') || param.type.startsWith('int')) {
      const b = BigInt(value.toString());
      const abs = b < 0n ? -b : b;
      if (abs > WEI_THRESHOLD) {
        const s = formatEther(b);
        const [i, d] = s.split('.');
        return `${i}.${(d || '').slice(0, 4)}`;
      }
      return b.toString();
    }
  } catch {
    /* fallthrough */
  }
  return String(value);
}

// 返回如 "setUserComputingPower(0x1234…abcd, 200)"；无法解码返回 null
export function decodeCalldata(data) {
  if (!data || data === '0x' || data.length < 10) return null;
  for (const iface of INTERFACES) {
    try {
      const parsed = iface.parseTransaction({ data });
      if (parsed && parsed.fragment) {
        const args = parsed.fragment.inputs.map((p, i) => formatParam(parsed.args[i], p));
        return `${parsed.fragment.name}(${args.join(', ')})`;
      }
    } catch {
      /* 尝试下一个 */
    }
  }
  return null;
}

// 解码失败时的兜底展示：前 20 字符 + 省略号
export function shortCalldata(data) {
  if (!data || data === '0x') return '无 calldata';
  const s = String(data);
  return s.length <= 22 ? s : `${s.slice(0, 20)}…`;
}
