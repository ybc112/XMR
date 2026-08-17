import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Space, Tag, Typography } from 'antd';
import {
  getStats,
  triggerSettlement,
  setWithdrawFee,
  setXmrPrice,
  emergencyPause,
  emergencyUnpause,
} from '../api/client';

function ParamCard({ title, tip, children }) {
  return (
    <Col xs={24} md={12}>
      <Card size="small" title={title}>
        {children}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          {tip}
        </Typography.Paragraph>
      </Card>
    </Col>
  );
}

export default function Settings() {
  const { message, modal } = App.useApp();
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState('');

  const [feeForm] = Form.useForm();
  const [priceForm] = Form.useForm();

  const loadStats = useCallback(() => {
    getStats()
      .then((d) => setStats(d || null))
      .catch((e) => message.error(e.message));
  }, [message]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!stats) return;
    feeForm.setFieldsValue({ fee: Number(stats.withdrawFee) || 0 });
    priceForm.setFieldsValue({ price: stats.xmrPrice != null ? String(stats.xmrPrice) : '' });
  }, [stats, feeForm, priceForm]);

  const runSave = async (key, fn, label) => {
    setSaving(key);
    try {
      const res = await fn();
      if (res && res.mode === 'multisig') {
        modal.info({
          title: '已提交多签',
          content: `${label}已提交多签交易 #${res.txId ?? '-'}，需 2/3 确认后到「多签管理」执行。`,
        });
      } else {
        message.success(`${label}已更新`);
      }
      loadStats();
    } catch (e) {
      message.error(e.message);
    } finally {
      setSaving('');
    }
  };

  const confirmThen = (title, content, onOk) => modal.confirm({ title, content, onOk });

  const paused = !!(stats && stats.paused);
  const rate = stats && stats.dailyRate != null ? Number(stats.dailyRate) / 100 : null;

  const runSettlement = () =>
    confirmThen(
      '手动触发结算',
      '将按当前实时 XMR 价格执行一轮结算，为所有合格用户发放静态收益与团队收益。正式环境建议在每日 12:00 后触发（测试期为每 30 分钟自动结算）。确认继续？',
      async () => {
        setSaving('settle');
        try {
          const res = await triggerSettlement();
          message.success(
            `结算已完成：周期 ${res?.period ?? '-'}，价格 ${res?.price ?? '-'} USDT，交易 ${res?.txHash ?? '-'}`,
          );
          loadStats();
        } catch (e) {
          message.error(e.message);
        } finally {
          setSaving('');
        }
      },
    );

  return (
    <div>
      <Row gutter={[12, 12]}>
        <ParamCard title="提现费率" tip="单位为基点：100 = 1%。应用于 USDT 提现手续费。">
          <Form
            form={feeForm}
            layout="inline"
            onFinish={({ fee }) =>
              confirmThen('确认修改提现费率？', `新费率：${fee} 基点（${fee / 100}%）`, () =>
                runSave('fee', () => setWithdrawFee(Number(fee)), '提现费率'),
              )
            }
          >
            <Form.Item name="fee" rules={[{ required: true, message: '请输入费率' }]}>
              <InputNumber min={0} precision={0} style={{ width: 180 }} addonAfter="基点" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={saving === 'fee'}>
                保存
              </Button>
            </Form.Item>
          </Form>
        </ParamCard>

        <ParamCard title="XMR 价格" tip="单位 USDT（ether 字符串），如 150.5。用于 XMR 相关结算。">
          <Form
            form={priceForm}
            layout="inline"
            onFinish={({ price }) =>
              confirmThen('确认修改 XMR 价格？', `新价格：${price} USDT`, () =>
                runSave('price', () => setXmrPrice(String(price)), 'XMR 价格'),
              )
            }
          >
            <Form.Item
              name="price"
              rules={[
                { required: true, message: '请输入价格' },
                {
                  validator: (_, v) =>
                    v === undefined || v === '' || (!isNaN(Number(v)) && Number(v) > 0)
                      ? Promise.resolve()
                      : Promise.reject(new Error('请输入有效的正数')),
                },
              ]}
            >
              <Input style={{ width: 180 }} placeholder="如 150.5" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={saving === 'price'}>
                保存
              </Button>
            </Form.Item>
          </Form>
        </ParamCard>

        <ParamCard
          title="手动结算"
          tip="按实时 XMR 价格立即执行一轮结算（静态收益 + 团队收益）。正式环境建议在每日 12:00 后触发；测试期后端每 30 分钟自动结算。"
        >
          <Space direction="vertical" size={4}>
            <Space>
              <Tag color="gold">日化率锁定 {rate != null ? `${rate}%` : '-'}</Tag>
              <Tag>
                上次结算周期 {stats && stats.lastSettlementPeriod != null ? Number(stats.lastSettlementPeriod) : '-'}
              </Tag>
            </Space>
            <Button type="primary" loading={saving === 'settle'} onClick={runSettlement}>
              立即执行结算
            </Button>
          </Space>
        </ParamCard>
      </Row>

      <Card
        size="small"
        title="危险区"
        style={{ marginTop: 12, borderColor: '#ffccc7' }}
        styles={{ header: { color: '#cf1322' } }}
        extra={paused ? <Tag color="red">当前已暂停</Tag> : <Tag color="green">运行中</Tag>}
      >
        <Space>
          <Button
            danger
            type="primary"
            size="large"
            disabled={paused}
            loading={saving === 'pause'}
            onClick={() =>
              confirmThen(
                '紧急暂停合约',
                '暂停后所有质押、提现、奖励发放将立即停止，影响全体用户！确认继续？',
                () => runSave('pause', () => emergencyPause(), '紧急暂停'),
              )
            }
          >
            紧急暂停
          </Button>
          <Button
            size="large"
            type="primary"
            disabled={!paused}
            loading={saving === 'unpause'}
            onClick={() =>
              confirmThen('恢复合约运行', '将解除紧急暂停状态，恢复所有合约功能。确认继续？', () =>
                runSave('unpause', () => emergencyUnpause(), '恢复运行'),
              )
            }
          >
            恢复运行
          </Button>
        </Space>
      </Card>
    </div>
  );
}
