import { CopyOutlined } from '@ant-design/icons';
import { App, Tooltip } from 'antd';
import { copyText, formatAddr } from '../utils/format';

// 可复制的文本（地址/哈希等），短格式 + 复制图标
export default function CopyableText({ text, shorten = true, head = 6, tail = 4, withTooltip = false, style }) {
  const { message } = App.useApp();
  if (text === null || text === undefined || text === '') return <span>-</span>;

  const doCopy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = await copyText(String(text));
    if (ok) message.success('已复制');
    else message.error('复制失败');
  };

  const display = shorten ? formatAddr(text, head, tail) : String(text);
  const body = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', ...(style || {}) }}>
      <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {display}
      </span>
      <a onClick={doCopy} title="复制" style={{ flexShrink: 0 }}>
        <CopyOutlined style={{ color: '#8c8c8c' }} />
      </a>
    </span>
  );

  return withTooltip ? <Tooltip title={String(text)}>{body}</Tooltip> : body;
}

// BscScan 交易哈希外链（testnet）
export function TxHashLink({ hash, head = 10, tail = 6 }) {
  if (!hash) return <span>-</span>;
  return (
    <a className="mono" href={`https://testnet.bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">
      {formatAddr(hash, head, tail)}
    </a>
  );
}
