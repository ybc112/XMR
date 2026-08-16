import { formatAmount, formatEtherDisplay } from '../utils/format';

// 金额展示：等宽字体，可选颜色（收入/支出）
// 支持后端返回的 { raw, formatted } 对象，优先显示 formatted
export default function Money({ value, color, dash = '-', style }) {
  let text;
  if (value && typeof value === 'object' && 'formatted' in value) {
    text = formatEtherDisplay(value.formatted);
  } else {
    text = formatAmount(value);
  }
  if (text === dash) {
    return <span className="mono" style={style}>{dash}</span>;
  }
  return (
    <span className="mono" style={{ color, ...style }}>
      {text}
    </span>
  );
}
