import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Input, Select, Space, Table, Tag } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { getUsers } from '../api/client';
import CopyableText from '../components/CopyableText';
import Money from '../components/Money';
import { formatISO, levelColor } from '../utils/format';
import UserDetailDrawer from './UserDetailDrawer';

export default function Users() {
  const { message } = App.useApp();

  const [q, setQ] = useState('');
  const [level, setLevel] = useState(undefined);
  const [exited, setExited] = useState(undefined);
  const [blacklisted, setBlacklisted] = useState(undefined);

  const [query, setQuery] = useState({ page: 1, limit: 10 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [detailAddress, setDetailAddress] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(
    async (params) => {
      const p = params || query;
      setLoading(true);
      try {
        const res = await getUsers(p);
        setRows((res && res.items) || []);
        setTotal((res && res.total) || 0);
      } catch (e) {
        message.error(e.message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, message],
  );

  useEffect(() => {
    load(query);
  }, [query, load]);

  const applyFilter = (patch) => {
    const next = { ...query, page: 1, ...patch };
    ['q', 'level', 'exited', 'blacklisted'].forEach((k) => {
      if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k];
    });
    setQuery(next);
  };

  const onReset = () => {
    setQ('');
    setLevel(undefined);
    setExited(undefined);
    setBlacklisted(undefined);
    setQuery({ page: 1, limit: query.limit });
  };

  const openDetail = (address) => {
    setDetailAddress(address);
    setDrawerOpen(true);
  };

  const columns = [
    {
      title: '地址',
      dataIndex: 'address',
      width: 160,
      fixed: 'left',
      render: (v) => <CopyableText text={v} />,
    },
    { title: '会员ID', dataIndex: 'memberId', width: 100 },
    {
      title: '等级',
      dataIndex: 'level',
      width: 76,
      align: 'center',
      render: (v) => (v ? <Tag color={levelColor(v)}>M{v}</Tag> : '-'),
    },
    { title: '个人业绩', dataIndex: 'personalAmount', align: 'right', width: 120, render: (v) => <Money value={v} /> },
    { title: '团队业绩', dataIndex: 'teamTotalVolume', align: 'right', width: 130, render: (v) => <Money value={v} /> },
    { title: '累计收益', dataIndex: 'totalEarned', align: 'right', width: 120, render: (v) => <Money value={v} /> },
    { title: '待提 USDT', dataIndex: 'pendingUSDT', align: 'right', width: 110, render: (v) => <Money value={v} /> },
    { title: '待提 XMR', dataIndex: 'pendingXMR', align: 'right', width: 110, render: (v) => <Money value={v} /> },
    {
      title: '算力',
      dataIndex: 'userComputingPower',
      width: 90,
      align: 'center',
      render: (v) => {
        const n = Number(v || 0);
        return n === 0 ? <Tag>全局</Tag> : <span className="mono">{n / 100}倍</span>;
      },
    },
    {
      title: '状态',
      width: 130,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.exited ? <Tag color="red">出局</Tag> : null}
          {r.isBlacklisted ? <Tag color="volcano">黑名单</Tag> : null}
          {!r.exited && !r.isBlacklisted ? <Tag color="green">正常</Tag> : null}
        </Space>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'registeredAt',
      width: 140,
      render: (v) => (v ? <span className="mono" style={{ fontSize: 12 }}>{formatISO(v)}</span> : '-'),
    },
    {
      title: '操作',
      width: 76,
      fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => openDetail(r.address)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap size={12}>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索地址或会员ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onSearch={(v) => applyFilter({ q: v || undefined })}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder="等级"
            value={level}
            onChange={(v) => {
              setLevel(v);
              applyFilter({ level: v });
            }}
            options={Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: `M${i + 1}` }))}
            style={{ width: 100 }}
          />
          <Select
            allowClear
            placeholder="出局"
            value={exited}
            onChange={(v) => {
              setExited(v);
              applyFilter({ exited: v });
            }}
            options={[
              { value: 1, label: '是' },
              { value: 0, label: '否' },
            ]}
            style={{ width: 90 }}
          />
          <Select
            allowClear
            placeholder="黑名单"
            value={blacklisted}
            onChange={(v) => {
              setBlacklisted(v);
              applyFilter({ blacklisted: v });
            }}
            options={[
              { value: 1, label: '是' },
              { value: 0, label: '否' },
            ]}
            style={{ width: 100 }}
          />
          <Button icon={<ReloadOutlined />} onClick={onReset}>
            重置
          </Button>
        </Space>
      </Card>

      <Card size="small">
        <Table
          rowKey="address"
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="small"
          scroll={{ x: 1500 }}
          pagination={{
            current: query.page,
            pageSize: query.limit,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 个用户`,
            onChange: (page, limit) => setQuery({ ...query, page, limit }),
          }}
        />
      </Card>

      <UserDetailDrawer
        address={detailAddress}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSwitchUser={openDetail}
      />
    </div>
  );
}
