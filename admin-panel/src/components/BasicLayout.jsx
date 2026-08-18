import { useEffect, useState } from 'react';
import { Button, Layout, Menu, Space, Tag, Typography, App as AntApp } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  SafetyOutlined,
  FileTextOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getStats, clearAuth } from '../api/client';
import { usePanelWallet } from '../context/WalletContext';
import { shortenAddr } from '../config/contracts';

const { Sider, Header, Content } = Layout;

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '数据看板' },
  { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/multisig', icon: <SafetyOutlined />, label: '多签管理' },
  { key: '/logs', icon: <FileTextOutlined />, label: '操作日志' },
  { key: '/settings', icon: <SettingOutlined />, label: '全局参数' },
];

export default function BasicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const wallet = usePanelWallet();
  const [collapsed, setCollapsed] = useState(false);
  const [paused, setPaused] = useState(null);
  const username = localStorage.getItem('xmr_admin_user') || 'admin';

  useEffect(() => {
    getStats()
      .then((s) => setPaused(!!(s && s.paused)))
      .catch(() => {});
  }, []);

  const logout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  const seg = location.pathname.split('/').filter(Boolean)[0];
  const selected = seg ? `/${seg}` : '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        width={208}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ overflow: 'auto', height: '100vh', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            padding: collapsed ? '16px 8px' : '20px 12px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            letterSpacing: 1,
          }}
        >
          {collapsed ? 'XMR' : 'XMR 质押后台'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, borderRight: 0 }}
        />
        <Menu
          theme="dark"
          mode="inline"
          selectable={false}
          items={[{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }]}
          onClick={({ key }) => key === 'logout' && logout()}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Typography.Text strong style={{ fontSize: 15 }}>
            BSC 质押 DApp 运营后台
          </Typography.Text>
          <Space size={12}>
            {paused === null ? null : paused ? (
              <Tag color="red">合约已暂停</Tag>
            ) : (
              <Tag color="green">合约运行中</Tag>
            )}
            {wallet.account ? (
              <Space size={6}>
                <Tag icon={<WalletOutlined />} color={wallet.isContractAdmin ? 'blue' : wallet.isMsOwner ? 'geekblue' : 'red'}>
                  {shortenAddr(wallet.account)}
                  {wallet.isContractAdmin ? ' · 管理员' : wallet.isMsOwner ? ' · 多签Owner' : ' · 无权限'}
                </Tag>
                <Typography.Link style={{ fontSize: 12 }} onClick={wallet.disconnect}>
                  断开
                </Typography.Link>
              </Space>
            ) : (
              <Button
                size="small"
                icon={<WalletOutlined />}
                loading={wallet.connecting}
                onClick={() =>
                  wallet.connect().catch((e) => message.error(e.message || '连接钱包失败'))
                }
              >
                连接钱包
              </Button>
            )}
            <Typography.Text>
              <UserOutlined style={{ marginRight: 6 }} />
              {username}
            </Typography.Text>
          </Space>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
