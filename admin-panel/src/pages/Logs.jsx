import { useEffect, useState } from 'react';
import { App, Card, Table, Tooltip } from 'antd';
import { getLogs } from '../api/client';
import { TxHashLink } from '../components/CopyableText';
import { actionLabel, formatAddr, formatMs } from '../utils/format';

export default function Logs() {
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getLogs({ page, limit })
      .then((res) => {
        setRows((res && res.items) || []);
        setTotal((res && res.total) || 0);
      })
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, limit, message]);

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 165,
      render: (v) => <span className="mono" style={{ fontSize: 12 }}>{formatMs(v)}</span>,
    },
    { title: '用户名', dataIndex: 'username', width: 110 },
    {
      title: '动作',
      dataIndex: 'action',
      width: 150,
      render: (v) => (v ? <Tooltip title={v}>{actionLabel(v)}</Tooltip> : '-'),
    },
    {
      title: '目标',
      dataIndex: 'target',
      width: 150,
      ellipsis: true,
      render: (v) =>
        v ? (
          <Tooltip title={v}>
            <span className="mono" style={{ fontSize: 12 }}>
              {formatAddr(v)}
            </span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: '详情',
      dataIndex: 'detail',
      ellipsis: true,
      render: (v) =>
        v ? (
          <Tooltip title={v}>
            <span style={{ fontSize: 12 }}>{v}</span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: '交易哈希',
      dataIndex: 'tx_hash',
      width: 140,
      render: (v) => <TxHashLink hash={v} />,
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 140,
      render: (v) => <span className="mono" style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
  ];

  return (
    <Card size="small" title="操作日志">
      <Table
        rowKey={(r, i) => `${r.id ?? ''}-${i}`}
        size="small"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, l) => {
            setPage(p);
            setLimit(l);
          },
        }}
      />
    </Card>
  );
}
