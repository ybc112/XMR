import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Col, Popconfirm, Row, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  confirmMultisigTx,
  executeMultisigTx,
  getMultisigOwners,
  getMultisigTransactions,
  revokeMultisigTx,
} from '../api/client';
import CopyableText from '../components/CopyableText';
import { decodeCalldata, shortCalldata } from '../utils/decodeCalldata';

const STAKING_ADDR = (import.meta.env.VITE_STAKING_ADDRESS || '').toLowerCase();

function renderTarget(to) {
  if (!to) return '-';
  if (STAKING_ADDR && String(to).toLowerCase() === STAKING_ADDR) {
    return <Tag color="blue">StakingDApp</Tag>;
  }
  return <CopyableText text={to} />;
}

export default function Multisig() {
  const { message } = App.useApp();
  const [owners, setOwners] = useState({ owners: [], required: '0', count: 0 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadOwners = useCallback(() => {
    getMultisigOwners()
      .then((d) => setOwners(d || { owners: [], required: '0', count: 0 }))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (p, l) => {
      setLoading(true);
      try {
        const res = await getMultisigTransactions({ page: p, limit: l });
        setRows((res && res.items) || []);
        setTotal((res && res.total) || 0);
      } catch (e) {
        message.error(e.message);
      } finally {
        setLoading(false);
      }
    },
    [message],
  );

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  useEffect(() => {
    load(page, limit);
  }, [page, limit, load]);

  const required = Number(owners.required || 0);

  const op = async (txId, fn, label) => {
    setBusyId(txId);
    try {
      await fn(txId);
      message.success(`${label}成功`);
      load(page, limit);
      loadOwners();
    } catch (e) {
      message.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'txId',
      width: 64,
      render: (v) => <span className="mono">#{v}</span>,
    },
    {
      title: '目标合约',
      dataIndex: 'to',
      width: 170,
      render: (v) => renderTarget(v),
    },
    {
      title: '操作内容',
      width: 340,
      render: (_, r) => {
        const decoded = decodeCalldata(r.data);
        if (decoded) {
          return (
            <code className="mono" style={{ fontSize: 12, background: '#f6f6f6', padding: '2px 6px', borderRadius: 4 }}>
              {decoded}
            </code>
          );
        }
        return (
          <Tooltip title={String(r.data || '')}>
            <code className="mono" style={{ fontSize: 12 }}>
              {shortCalldata(r.data)}
            </code>
          </Tooltip>
        );
      },
    },
    {
      title: 'BNB',
      dataIndex: 'value',
      width: 110,
      align: 'right',
      render: (v) => {
        if (!v) return '-';
        const raw = typeof v.raw === 'bigint' ? v.raw : Number(v.raw || 0);
        if (!raw) return '-';
        return <span className="mono">{v.formatted} BNB</span>;
      },
    },
    {
      title: '确认数',
      width: 100,
      align: 'center',
      render: (_, r) => {
        const conf = Number(r.numConfirmations || 0);
        const ok = required > 0 && conf >= required;
        return (
          <span className="mono" style={ok && !r.executed ? { color: '#389e0d', fontWeight: 700 } : undefined}>
            {conf}/{required || '-'}
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'executed',
      width: 90,
      align: 'center',
      render: (v) => (v ? <Tag color="green">已执行</Tag> : <Tag color="orange">待确认</Tag>),
    },
    {
      title: '操作',
      width: 210,
      fixed: 'right',
      render: (_, r) => {
        const conf = Number(r.numConfirmations || 0);
        const executable = !r.executed && required > 0 && conf >= required;
        return (
          <Space size={4}>
            {!r.executed && (
              <Popconfirm title={`确认多签交易 #${r.txId}？`} onConfirm={() => op(r.txId, confirmMultisigTx, '确认')}>
                <Button size="small" loading={busyId === r.txId}>
                  确认
                </Button>
              </Popconfirm>
            )}
            {!r.executed && (
              <Popconfirm title={`撤销对交易 #${r.txId} 的确认？`} onConfirm={() => op(r.txId, revokeMultisigTx, '撤销')}>
                <Button size="small" loading={busyId === r.txId}>
                  撤销
                </Button>
              </Popconfirm>
            )}
            {executable && (
              <Popconfirm title={`执行多签交易 #${r.txId}？`} onConfirm={() => op(r.txId, executeMultisigTx, '执行')}>
                <Button size="small" type="primary" loading={busyId === r.txId}>
                  执行
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Card size="small" title="多签钱包 Owners" style={{ marginBottom: 12 }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Space size={6} wrap>
            {(owners.owners || []).map((o) => (
              <Tag key={o} color="geekblue">
                <span className="mono">{o}</span>
              </Tag>
            ))}
          </Space>
          <Typography.Text type="secondary">
            阈值：需 <Typography.Text strong>{owners.required}</Typography.Text> / {owners.count} 位 owner 确认后方可执行交易
          </Typography.Text>
        </Space>
      </Card>

      <Card size="small" title="多签交易列表">
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col flex="auto">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              解码规则：内置管理函数 ABI 片段匹配 calldata；unknown 显示前 20 字符。地址参数缩写展示，大于 1e15 的整数按 ether 格式化。
            </Typography.Text>
          </Col>
        </Row>
        <Table
          rowKey="txId"
          size="small"
          columns={columns}
          dataSource={rows}
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 笔`,
            onChange: (p, l) => {
              setPage(p);
              setLimit(l);
            },
          }}
        />
      </Card>
    </div>
  );
}
