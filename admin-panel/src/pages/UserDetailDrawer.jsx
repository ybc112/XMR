import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Breadcrumb,
  Button,
  Descriptions,
  Drawer,
  Form,
  InputNumber,
  Popconfirm,
  Progress,
  Radio,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
} from 'antd';
import {
  getUserDetail,
  getUserEvents,
  getUserReferrals,
  getUserTree,
  adjustBalance,
  setBlacklist,
  processXmrWithdrawal,
} from '../api/client';
import CopyableText, { TxHashLink } from '../components/CopyableText';
import Money from '../components/Money';
import { usePanelWallet } from '../context/WalletContext';
import { sendTx, txErrorMessage } from '../config/contracts';
import {
  eventDirection,
  eventLabel,
  eventTagColor,
  formatISO,
  formatSec,
  levelColor,
} from '../utils/format';

/* ---------------- 直推列表 ---------------- */
function ReferralsTab({ address, onSwitchUser }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getUserReferrals(address, { params: { page, limit } })
      .then((res) => {
        setRows((res && res.items) || []);
        setTotal((res && res.total) || 0);
      })
      .catch((e) => {
        const m = String(e.message || '');
        if (/timeout|ETIMEDOUT|NETWORK_ERROR/i.test(m)) {
          message.error('直推列表加载超时，请检查网络或稍后重试');
        } else {
          message.error(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [address, page, limit, message]);

  const columns = [
    {
      title: '地址',
      dataIndex: 'address',
      render: (v) => (
        <Space size={4}>
          <CopyableText text={v} />
          <Typography.Link style={{ fontSize: 12 }} onClick={() => onSwitchUser(v)}>
            查看
          </Typography.Link>
        </Space>
      ),
    },
    { title: '会员ID', dataIndex: 'memberId', width: 100 },
    {
      title: '等级',
      dataIndex: 'level',
      width: 76,
      align: 'center',
      render: (v) => (v ? <Tag color={levelColor(v)}>M{v}</Tag> : '-'),
    },
    { title: '个人业绩', dataIndex: 'personalAmount', align: 'right', render: (v) => <Money value={v} /> },
    { title: '团队业绩', dataIndex: 'teamTotalVolume', align: 'right', render: (v) => <Money value={v} /> },
  ];

  return (
    <Table
      rowKey={(r) => r.address}
      size="small"
      columns={columns}
      dataSource={rows}
      loading={loading}
      pagination={{ current: page, pageSize: limit, total, size: 'small', showTotal: (t) => `共 ${t}`, onChange: setPage }}
    />
  );
}

/* ---------------- 团队树 ---------------- */
function TreeTab({ address, onSwitchUser }) {
  const { message } = App.useApp();
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);

  useEffect(() => {
    setLoading(true);
    getUserTree(address, { params: { depth: 3 } })
      .then((root) => {
        setTreeData(root || null);
        // 默认展开根节点和第一层
        const keys = [];
        const collect = (n, depth) => {
          if (depth <= 1) keys.push(n.address);
          (n.children || []).forEach((c) => collect(c, depth + 1));
        };
        if (root) collect(root, 0);
        setExpandedKeys(keys);
      })
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [address, message]);

  const toNode = (n) => ({
    key: n.address,
    title: (
      <Space size={6} wrap={false}>
        <Tag color={levelColor(n.level)} style={{ marginRight: 0 }}>
          M{n.level}
        </Tag>
        <span>{n.memberId || '-'}</span>
        <Typography.Text type="secondary" className="mono" style={{ fontSize: 12 }}>
          个人 {n.personalAmount != null ? String(n.personalAmount) : '-'} · 团队 {n.teamTotalVolume != null ? String(n.teamTotalVolume) : '-'}
        </Typography.Text>
        <Typography.Link
          style={{ fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            onSwitchUser(n.address);
          }}
        >
          详情
        </Typography.Link>
      </Space>
    ),
    children: (n.children || []).map(toNode),
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }
  if (!treeData || !treeData.address) {
    return (
      <Typography.Text type="secondary">
        暂无团队树数据
      </Typography.Text>
    );
  }
  const rootNode = toNode(treeData);
  const hasChildren = (rootNode.children || []).length > 0;

  return (
    <>
      {!hasChildren && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          该用户暂无直推下级
        </Typography.Text>
      )}
      <Tree
        showLine
        blockNode
        expandedKeys={expandedKeys}
        onExpand={(keys) => setExpandedKeys(keys)}
        onSelect={(keys) => {
          // 点击节点标题也切换展开/折叠
          const key = keys[0];
          if (!key) return;
          setExpandedKeys((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
          );
        }}
        treeData={[rootNode]}
        style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}
      />
    </>
  );
}

/* ---------------- 资金流水 ---------------- */
const EVENT_DIR_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'in', label: '收入' },
  { value: 'out', label: '支出' },
];

function EventsTab({ address }) {
  const { message } = App.useApp();
  const [dir, setDir] = useState('all');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getUserEvents(address, { params: { page, limit, direction: dir } })
      .then((res) => {
        setRows((res && res.items) || []);
        setTotal((res && res.total) || 0);
      })
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [address, dir, page, limit, message]);

  const columns = [
    {
      title: '时间',
      width: 150,
      render: (_, r) => (r.timestamp ? <span className="mono" style={{ fontSize: 12 }}>{formatSec(r.timestamp)}</span> : `区块 #${r.blockNumber ?? '-'}`),
    },
    {
      title: '类型',
      dataIndex: 'eventType',
      width: 120,
      render: (v) => (
        <Tag color={eventTagColor(v)}>{eventLabel(v)}</Tag>
      ),
    },
    {
      title: '金额',
      width: 140,
      align: 'right',
      render: (_, r) => {
        const args = r.args || {};
        const amt = args.amount ?? args.xmrAmount ?? args.usdtAmount;
        if (amt === undefined || amt === null) return '-';
        const d = eventDirection(r.eventType);
        return <Money value={amt} color={d === 'in' ? '#389e0d' : d === 'out' ? '#cf1322' : undefined} />;
      },
    },
    {
      title: '详情',
      width: 220,
      render: (_, r) => {
        if (r.eventType === 'XMRAddressSet') {
          const args = r.args || {};
          const addr = args.xmrAddr || args.xmrAddress;
          if (!addr) return '-';
          return <CopyableText text={String(addr)} withTooltip />;
        }
        return '-';
      },
    },
    {
      title: '交易哈希',
      dataIndex: 'txHash',
      render: (v) => <TxHashLink hash={v} />,
    },
  ];

  return (
    <div>
      <Radio.Group
        options={EVENT_DIR_OPTIONS}
        value={dir}
        onChange={(e) => {
          setDir(e.target.value);
          setPage(1);
        }}
        optionType="button"
        size="small"
        style={{ marginBottom: 12 }}
      />
      <Table
        rowKey={(r, i) => `${r.txHash || i}-${r.eventType}-${i}`}
        size="small"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{ current: page, pageSize: limit, total, size: 'small', showTotal: (t) => `共 ${t} 条`, onChange: setPage }}
      />
    </div>
  );
}

/* ---------------- 管理操作 ---------------- */
function ActionsTab({ address, detail, onRefresh }) {
  const { message, modal } = App.useApp();
  const wallet = usePanelWallet();
  const [balanceForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const friendlyActionError = (msg) => {
    const m = String(msg || '');
    if (/不是多签 owner|owner not exists/i.test(m)) {
      return '后端钱包不是多签 owner，无法提交多签。请连接钱包直接签名，或去主站 /admin 用多签 owner 钱包执行。';
    }
    if (/管理员钱包未配置/i.test(m)) {
      return '后端未配置管理员钱包。请点击右上角「连接钱包」，用小狐狸直接签名操作。';
    }
    if (/only ?owner|only ?admin/i.test(m)) {
      return '当前钱包不是合约管理员，无法执行该操作。';
    }
    if (/insufficient funds|gas required|underpriced/i.test(m)) {
      return '钱包 gas 不足，请充值 tBNB。';
    }
    return m;
  };

  const runOp = async (fn, successMsg) => {
    setSubmitting(true);
    try {
      if (wallet.canSignDirectly) {
        // 前端直签：小狐狸确认后直接上链
        const staking = await wallet.getStakingWithSigner();
        await fn(staking);
        message.success(successMsg || '操作成功');
      } else {
        const res = await fn(null);
        if (res && res.mode === 'multisig') {
          modal.info({
            title: '已提交多签',
            content: `操作已提交多签交易 #${res.txId ?? '-'}，需 2/3 确认后到「多签管理」执行。`,
          });
        } else {
          message.success(successMsg || '操作成功');
        }
      }
      onRefresh && onRefresh();
      return true;
    } catch (e) {
      message.error(wallet.canSignDirectly ? txErrorMessage(e) : friendlyActionError(e.message));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const submitBalance = ({ kind, delta }) => {
    modal.confirm({
      title: '确认调整余额',
      content: `将为用户 ${address} ${delta >= 0 ? '增加' : '减少'} ${Math.abs(delta)} ${kind}，确认执行？`,
      onOk: async () => {
        const ok = await runOp(
          (staking) =>
            staking
              ? sendTx(() =>
                  kind === 'USDT'
                    ? staking.adjustUserUSDT(address, BigInt(Math.round(Number(delta))))
                    : staking.adjustUserXMR(address, BigInt(Math.round(Number(delta)))),
                )
              : adjustBalance(address, { kind, delta: Number(delta) }),
          '余额调整已提交',
        );
        if (ok) balanceForm.resetFields();
      },
    });
  };

  const toggleBlacklist = () => {
    const next = !(detail && detail.isBlacklisted);
    modal.confirm({
      title: next ? '确认拉黑该用户' : '确认解除拉黑',
      content: next ? '拉黑后该用户将无法进行合约交互。' : '解除后将恢复该用户的正常使用。',
      okButtonProps: next ? { danger: true } : undefined,
      onOk: () =>
        runOp(
          (staking) =>
            staking
              ? sendTx(() => staking.setBlacklist(address, next))
              : setBlacklist(address, next),
          next ? '已拉黑' : '已解除拉黑',
        ),
    });
  };

  const processWithdrawal = () =>
    runOp(
      (staking) =>
        staking
          ? sendTx(() => staking.processXMRWithdrawal(address))
          : processXmrWithdrawal(address),
      'XMR 提现已处理',
    );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {wallet.canSignDirectly ? (
          <Tag color="blue">钱包直签模式：操作将通过小狐狸签名直接上链</Tag>
        ) : (
          <Tag color="orange">后端模式：建议点右上角「连接钱包」用小狐狸直接签名</Tag>
        )}
      </div>
      <CardLikeBlock title="调整余额">
        <Form
          form={balanceForm}
          layout="inline"
          onFinish={submitBalance}
          initialValues={{ kind: 'USDT', delta: 0 }}
        >
          <Form.Item name="kind">
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio.Button value="USDT">USDT</Radio.Button>
              <Radio.Button value="XMR">XMR</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="delta" rules={[{ required: true, message: '请输入数值' }]}>
            <InputNumber step={10} style={{ width: 160 }} placeholder="正数增加 负数减少" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交调整
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          正数增加、负数减少；增加 USDT 不会注入真实资金，需先确保合约余额充足
        </Typography.Paragraph>
      </CardLikeBlock>

      <CardLikeBlock title="黑名单">
        <Space>
          <Typography.Text>
            当前状态：
            {detail && detail.isBlacklisted ? <Tag color="volcano">黑名单</Tag> : <Tag color="green">正常</Tag>}
          </Typography.Text>
          <Popconfirm
            title={detail && detail.isBlacklisted ? '确认解除拉黑？' : '确认拉黑该用户？'}
            onConfirm={toggleBlacklist}
            okText="确认"
            cancelText="取消"
          >
            <Button danger={!(detail && detail.isBlacklisted)} loading={submitting}>
              {detail && detail.isBlacklisted ? '解除拉黑' : '拉黑用户'}
            </Button>
          </Popconfirm>
        </Space>
      </CardLikeBlock>

      {detail && Number(detail.pendingXMR) > 0 && (
        <CardLikeBlock title="处理 XMR 提现">
          <Space>
            <Typography.Text>
              该用户有待提 XMR：<Money value={detail.pendingXMR} />
            </Typography.Text>
            <Popconfirm
              title="确认已线下打款？"
              description="将触发链上 XMR 提现到账处理"
              onConfirm={processWithdrawal}
              okText="已打款，处理"
              cancelText="取消"
            >
              <Button type="primary" danger loading={submitting}>
                处理 XMR 提现
              </Button>
            </Popconfirm>
          </Space>
        </CardLikeBlock>
      )}
    </div>
  );
}

function CardLikeBlock({ title, children }) {
  return (
    <div
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        padding: '16px 16px 12px',
        marginBottom: 16,
        background: '#fafafa',
      }}
    >
      <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
        {title}
      </Typography.Text>
      {children}
    </div>
  );
}

/* ---------------- Drawer 主体 ---------------- */
export default function UserDetailDrawer({ address, open, onClose, onSwitchUser }) {
  const { message } = App.useApp();
  const [addr, setAddr] = useState(address);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && address) {
      setAddr(address);
    }
  }, [open, address]);

  const loadDetail = useCallback(
    (target) => {
      if (!target) return;
      setLoading(true);
      getUserDetail(target)
        .then((d) => setDetail(d))
        .catch((e) => message.error(e.message))
        .finally(() => setLoading(false));
    },
    [message],
  );

  useEffect(() => {
    if (open && addr) {
      loadDetail(addr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, addr]);

  const switchUser = (target) => {
    if (!target) return;
    if (target === addr) {
      message.info('已是当前用户');
      return;
    }
    setAddr(target);
    loadDetail(target);
    message.success('已切换到该用户详情');
  };

  const d = detail || {};
  const earned = Number(d.totalEarned?.formatted || 0);
  const remain = Number(d.remainingExitLimit?.formatted || 0);
  const limitTotal = earned + remain;
  const exitPercent = limitTotal > 0 ? Math.min(100, (earned / limitTotal) * 100) : 0;

  const tabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="地址">
            <CopyableText text={d.address} shorten={false} />
          </Descriptions.Item>
          <Descriptions.Item label="会员ID">{d.memberId || '-'}</Descriptions.Item>
          <Descriptions.Item label="推荐人">
            {d.referrer ? <CopyableText text={d.referrer} /> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="上级链路">
            {d.referrerChain && d.referrerChain.length ? (
              <Breadcrumb
                items={d.referrerChain.map((n) => ({
                  title: (
                    <Typography.Link onClick={() => switchUser(n.address)}>
                      {n.memberId || formatShort(n.address)}(M{n.level ?? '-'})
                    </Typography.Link>
                  ),
                }))}
              />
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {d.registeredAt ? formatISO(d.registeredAt) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="等级">
            {d.level ? <Tag color={levelColor(d.level)}>M{d.level}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="XMR 收款地址">
            {d.xmrAddress ? (
              <CopyableText text={d.xmrAddress} shorten={false} />
            ) : (
              <Typography.Text type="secondary">未绑定</Typography.Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="直推数量">
            <span className="mono">{d.directReferralCount ?? '-'}</span>
          </Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'funds',
      label: '资金',
      children: (
        <div>
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="个人业绩">
              <Money value={d.personalAmount} />
            </Descriptions.Item>
            <Descriptions.Item label="累计收益">
              <Money value={d.totalEarned} />
            </Descriptions.Item>
            <Descriptions.Item label="出局额度">
              <div style={{ minWidth: 200 }}>
                <Progress
                  percent={Number(exitPercent.toFixed(2))}
                  status={exitPercent >= 100 ? 'exception' : 'active'}
                  size="small"
                  format={(p) => `${p}%`}
                />
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="剩余额度">
              <Money value={d.remainingExitLimit} />
            </Descriptions.Item>
            <Descriptions.Item label="小区业绩">
              <Money value={d.subAreaVolume} />
            </Descriptions.Item>
            <Descriptions.Item label="团队总业绩">
              <Money value={d.teamTotalVolume} />
            </Descriptions.Item>
            <Descriptions.Item label="待提 USDT">
              <Money value={d.pendingUSDT} />
            </Descriptions.Item>
            <Descriptions.Item label="待提 XMR">
              <Money value={d.pendingXMR} />
            </Descriptions.Item>
            <Descriptions.Item label="算力">
              <Money value={d.personalAmount} />
            </Descriptions.Item>
          </Descriptions>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
            出局额度进度 = 累计收益 ÷（累计收益 + 剩余额度）
          </Typography.Paragraph>
        </div>
      ),
    },
    {
      key: 'referrals',
      label: '直推列表',
      children: <ReferralsTab address={addr} onSwitchUser={switchUser} />,
    },
    {
      key: 'tree',
      label: '团队树',
      children: <TreeTab address={addr} onSwitchUser={switchUser} />,
    },
    {
      key: 'events',
      label: '资金流水',
      children: <EventsTab address={addr} />,
    },
    {
      key: 'actions',
      label: '管理操作',
      children: <ActionsTab address={addr} detail={detail} onRefresh={() => loadDetail(addr)} />,
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      title={
        <Space>
          <span>用户详情</span>
          {addr ? <CopyableText text={addr} /> : null}
          {loading ? <Spin size="small" /> : null}
        </Space>
      }
      destroyOnClose
    >
      <Tabs items={tabItems} defaultActiveKey="info" size="small" />
    </Drawer>
  );
}

function formatShort(addr) {
  if (!addr) return '-';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
