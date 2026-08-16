import { formatAmount } from '../utils/format';

// 金额展示：等宽字体，可选颜色（收入/支出）
export default function Money({ value, color, dash = '-', style }) {
  const text = formatAmount(value);
  if (text === dash) {
    return <span className="mono" style={style}>{dash}</span>;
  }
  return (
    <span className="mono" style={{ color, ...style }}>
      {text}
    </span>
  );
}
