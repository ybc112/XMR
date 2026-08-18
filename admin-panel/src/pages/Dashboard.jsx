import { useCallback, useEffect, useState } from 'react';
import { App, Card, Col, Descriptions, Popconfirm, Row, Statistic, Table, Tag, Typography } from 'antd';
import {
  TeamOutlined,
  DollarOutlined,
  UserAddOutlined,
  RiseOutlined,
  HourglassOutlined,
  WalletOutlined,
  MoneyCollectOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { getStats, processXmrWithdrawal } from '../api/client';
import { usePanelWallet } from '../context/WalletContext';
import { sendTx, txErrorMessage } from '../config/contracts';
import CopyableText, { TxHashLink } from '../components/CopyableText';
import Money from '../components/Money';
import { formatAmount, formatSec } from '../utils/format';

function StatCard({ icon, title, value, suffix, loading }) {
  return (
    <Card size="small" variant="borderless" loading={loading} styles={{ body: { padding: '16px 20px' } }}>
      <Statistic
        title={
          <span style={{ fontSize: 13 }}>
            {icon} {title}
          </span>
        }
        value={value}
        suffix={suffix}
        valueStyle={{ fontSize: 20, fontFamily: "'SFMono-Regular', Consolas, monospace" }}
      />
    </Card>
  );
}

function friendlyProcessError(msg) {
  const m = String(msg || '');
  if (/管理员钱包未配置/.test(m)) return '后端管理员钱包未配置（服务器缺少 ADMIN_PRIVATE_KEY），无法处理';
  if (/only ?admin/i.test(m)) return '后端管理员钱包不是合约 admin：请到主站 /admin 页通过多签把后端钱包地址加为管理员';
  if (/insufficient funds|gas required|underpriced/i.test(m)) return '后端管理员钱包 tBNB 不足，请先给服务器钱包充值 gas';
  if (/nonce/i.test(m)) return '交易 nonce 冲突，请稍几秒后重试';
  if (/no pending/i.test(m)) return '该用户链上已无待处理提现，请刷新列表';
  if (/network|timeout|ETIMEDOUT/i.test(m)) return '区块链网络暂时不可用，请稍后重试';
  return m;
}

export default function Dashboard() {
  const { message, modal } = App.useApp();
  const wallet = usePanelWallet();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStats();
      setStats(data || null);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const onProcess = async (user) => {
    setProcessing(user);
    try {
      if (wallet.canSignDirectly) {
        // 前端直签：小狐狸确认后直接上链
        const staking = await wallet.getStakingWithSigner();
        await sendTx(() => staking.processXMRWithdrawal(user));
        message.success('已处理该笔 XMR 提现');
      } else {
        const res = await processXmrWithdrawal(user);
        if (res && res.mode === 'multisig') {
          modal.info({
            title: '已提交多签',
            content: (
              <div>
                <p>该操作已提交多签交易 #{res.txId ?? '-'}，需 2/3 确认后到「多签管理」执行。</p>
                {res.txHash ? (
                  <Typography.Text copyable={{ text: res.txHash }} className="mono" style={{ fontSize: 12 }}>
                    {res.txHash}
                  </Typography.Text>
                ) : null}
              </div>
            ),
          });
        } else {
          message.success('已处理该笔 XMR 提现');
        }
      }
      load();
    } catch (e) {
      message.error(wallet.canSignDirectly ? txErrorMessage(e) : friendlyProcessError(e.message));
    } finally {
      setProcessing('');
    }
  };

  const s = stats || {};
  const pendingList = s.pendingXMRList || [];
  const recentRegistrations = s.recentRegistrations || [];
  const recentInvestments = s.recentInvestments || [];

  const pendingColumns = [
    {
      title: '用户地址',
      dataIndex: 'user',
      width: 170,
      render: (v) => <CopyableText text={v} />,
    },
    {
      title: 'XMR 金额',
      dataIndex: 'amount',
      align: 'right',
      width: 130,
      render: (v) => <Money value={v} />,
    },
    {
      title: 'XMR 收款地址',
      dataIndex: 'xmrAddress',
      ellipsis: true,
      render: (v) => <CopyableText text={v} head={18} tail={10} withTooltip />,
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      width: 150,
      render: (v, r) => (v ? formatSec(v) : r.txHash ? <TxHashLink hash={r.txHash} /> : '-'),
    },
    {
      title: '操作',
      width: 130,
      render: (_, r) => (
        <Popconfirm
          title="确认已线下打款？"
          description="将触发链上 XMR 提现到账处理"
          onConfirm={() => onProcess(r.user)}
          okText="已打款，处理"
          cancelText="取消"
        >
          <Typography.Link loading={processing === r.user}>已打款-处理</Typography.Link>
        </Popconfirm>
      ),
    },
  ];

  const regColumns = [
    { title: '地址', dataIndex: ['args', 'user'], width: 160, render: (v) => <CopyableText text={v} /> },
    { title: '会员ID', dataIndex: ['args', 'memberId'], width: 100 },
    { title: '推荐人', dataIndex: ['args', 'referrer'], width: 160, render: (v) => <CopyableText text={v} /> },
    { title: '时间', dataIndex: 'timestamp', width: 140, render: formatSec },
    { title: '交易', dataIndex: 'txHash', width: 110, render: (v) => <TxHashLink hash={v} /> },
  ];

  const investColumns = [
    { title: '地址', dataIndex: ['args', 'user'], width: 160, render: (v) => <CopyableText text={v} /> },
    {
      title: '投资额 USDT',
      dataIndex: ['args', 'amount'],
      align: 'right',
      width: 130,
      render: (v) => <Money value={v} />,
    },
    {
      title: '个人总业绩',
      dataIndex: ['args', 'totalPersonal'],
      align: 'right',
      width: 130,
      render: (v) => <Money value={v} />,
    },
    { title: '时间', dataIndex: 'timestamp', width: 140, render: formatSec },
    { title: '交易', dataIndex: 'txHash', width: 110, render: (v) => <TxHashLink hash={v} /> },
  ];

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={12} lg={6}>
          <StatCard icon={<TeamOutlined />} title="总用户数" value={s.totalUsers ?? '-'} loading={loading} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard icon={<DollarOutlined />} title="总投资额 USDT" value={formatAmount(s.totalUSDTDeposited)} loading={loading} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard icon={<UserAddOutlined />} title="今日新增用户" value={s.todayNewUsers ?? '-'} loading={loading} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard icon={<RiseOutlined />} title="今日投资额 USDT" value={formatAmount(s.todayInvestedAmount)} loading={loading} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            icon={<HourglassOutlined />}
            title="待处理 XMR 提现"
            value={s.pendingXMRCount ?? '-'}
            loading={loading}
            suffix={s.pendingXMRCount > 0 ? <Tag color="red" style={{ marginLeft: 8 }}>待处理</Tag> : null}
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard icon={<WalletOutlined />} title="合约 USDT 余额" value={formatAmount(s.contractUSDTBalance)} loading={loading} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard icon={<MoneyCollectOutlined />} title="合约 XMR 余额" value={formatAmount(s.contractXMRBalance)} loading={loading} />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard icon={<TagOutlined />} title="XMR 价格 (USDT)" value={formatAmount(s.xmrPrice)} loading={loading} />
        </Col>
      </Row>

      <Card size="small" title="合约参数" style={{ marginTop: 12 }} loading={loading}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }}>
          <Descriptions.Item label="日化率">
            <span className="mono">{s.dailyRate != null ? `${Number(s.dailyRate) / 100}%` : '-'}</span>
          </Descriptions.Item>
          <Descriptions.Item label="算力">
            <span className="mono">{s.computingPower != null ? `${Number(s.computingPower)} (${Number(s.computingPower) / 100}倍)` : '-'}</span>
          </Descriptions.Item>
          <Descriptions.Item label="提现费率">
            <span className="mono">{s.withdrawFee != null ? `${Number(s.withdrawFee) / 100}%` : '-'}</span>
          </Descriptions.Item>
          <Descriptions.Item label="暂停状态">
            {s.paused ? <Tag color="red">已暂停</Tag> : <Tag color="green">运行中</Tag>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        size="small"
        title={`待处理 XMR 提现（${pendingList.length} 笔）`}
        style={{ marginTop: 12 }}
        extra={<Typography.Link onClick={load}>刷新</Typography.Link>}
      >
        <Table
          rowKey={(r) => `${r.txHash || ''}-${r.user || ''}`}
          columns={pendingColumns}
          dataSource={pendingList}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          locale={{ emptyText: '暂无待处理提现' }}
        />
      </Card>

      <Row gutter={12} style={{ marginTop: 12 }}>
        <Col xs={24} xl={12}>
          <Card size="small" title="最近注册">
            <Table
              rowKey={(r) => r.txHash || `${r.args && r.args.user}-${r.timestamp}`}
              columns={regColumns}
              dataSource={recentRegistrations}
              loading={loading}
              pagination={false}
              size="small"
              scroll={{ x: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="最近投资">
            <Table
              rowKey={(r) => r.txHash || `${r.args && r.args.user}-${r.timestamp}`}
              columns={investColumns}
              dataSource={recentInvestments}
              loading={loading}
              pagination={false}
              size="small"
              scroll={{ x: 700 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
