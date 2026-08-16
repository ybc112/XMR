import { useState } from 'react';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client';

export default function Login() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const data = await login(values);
      localStorage.setItem('xmr_admin_token', data.token);
      localStorage.setItem('xmr_admin_user', data.username || '');
      message.success('登录成功');
      navigate('/', { replace: true });
    } catch (e) {
      message.error(e.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #1f1c2c 0%, #3a2f2b 60%, #e6631a33 100%)',
      }}
    >
      <Card style={{ width: 380, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }} styles={{ body: { padding: '36px 32px' } }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            XMR 质押运营后台
          </Typography.Title>
          <Typography.Text type="secondary">BSC Staking DApp Admin</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} autoComplete="off" size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
