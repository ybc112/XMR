import axios from 'axios';

const TOKEN_KEY = 'xmr_admin_token';
const USER_KEY = 'xmr_admin_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// API 地址：开发环境用本地后端；生产环境（Vercel）用相对路径 /api，
// 由 vercel.json 服务端转发到服务器 3001（避免 HTTPS 页面请求 HTTP 的混合内容拦截）
const client = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE ||
    (import.meta.env.DEV ? 'http://localhost:3001' : ''),
  timeout: 30000,
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && 'success' in body) {
      if (!body.success) {
        return Promise.reject(new Error(body.message || body.error || '请求失败'));
      }
      return body.data;
    }
    return body;
  },
  (err) => {
    if (err.response && err.response.status === 401) {
      clearAuth();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    }
    const msg =
      (err.response && err.response.data && (err.response.data.message || err.response.data.error)) ||
      err.message ||
      '网络错误';
    return Promise.reject(new Error(msg));
  },
);

// ---------- 认证 ----------
export const login = (payload) => client.post('/api/auth/login', payload);

// ---------- 看板 ----------
export const getStats = () => client.get('/api/admin/stats');
export const getPendingXmrWithdrawals = (params) =>
  client.get('/api/admin/pending-xmr-withdrawals', { params });

// ---------- 用户 ----------
export const getUsers = (params) => client.get('/api/admin/users', { params });
export const getUserDetail = (address) => client.get(`/api/admin/users/${address}`);
export const updateUserRemark = (address, remark) =>
  client.put(`/api/admin/users/${address}/remark`, { remark });
export const getUserReferrals = (address, params) =>
  client.get(`/api/admin/users/${address}/referrals`, { params });
export const getUserEvents = (address, params) =>
  client.get(`/api/admin/users/${address}/events`, { params });
export const getUserTree = (address, params) =>
  client.get(`/api/admin/users/${address}/tree`, { params });

export const adjustBalance = (address, payload) =>
  client.post(`/api/admin/users/${address}/adjust-balance`, payload);
export const setBlacklist = (address, status) =>
  client.post(`/api/admin/users/${address}/blacklist`, { status });
export const processXmrWithdrawal = (address) =>
  client.post(`/api/admin/users/${address}/process-xmr-withdrawal`);

// ---------- 日志 ----------
export const getLogs = (params) => client.get('/api/admin/logs', { params });

// ---------- 多签 ----------
export const getMultisigOwners = () => client.get('/api/multisig/owners');
export const getMultisigTransactions = (params) =>
  client.get('/api/multisig/transactions', { params });
export const confirmMultisigTx = (txId) => client.post(`/api/multisig/confirm/${txId}`);
export const revokeMultisigTx = (txId) => client.post(`/api/multisig/revoke/${txId}`);
export const executeMultisigTx = (txId) => client.post(`/api/multisig/execute/${txId}`);

// ---------- 全局参数 ----------
export const setXmrPrice = (price) => client.post('/api/admin/set-xmr-price', { price });
export const triggerSettlement = (xmrPrice) =>
  client.post('/api/admin/daily-settlement', xmrPrice ? { xmrPrice } : {});
export const setWithdrawFee = (fee) => client.post('/api/admin/set-withdraw-fee', { fee });
export const emergencyPause = () => client.post('/api/admin/emergency-pause');
export const emergencyUnpause = () => client.post('/api/admin/emergency-unpause');

export default client;
