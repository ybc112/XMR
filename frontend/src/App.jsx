import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'

const Dashboard = lazy(() => import('./components/dashboard/Dashboard.jsx'))
const Staking = lazy(() => import('./components/staking/Staking.jsx'))
const Team = lazy(() => import('./components/team/Team.jsx'))
const Exchange = lazy(() => import('./components/exchange/Exchange.jsx'))
const Assets = lazy(() => import('./components/assets/Assets.jsx'))
const Records = lazy(() => import('./components/records/Records.jsx'))
const Admin = lazy(() => import('./components/admin/Admin.jsx'))

// 路由 -> 页面标题（浏览器标签、搜索引擎、TP 钱包等都会读取 document.title）
const ROUTE_TITLES = {
  '/admin': '管理',
}
const DEFAULT_TITLE = '门罗币'

function useDocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = ROUTE_TITLES[pathname] || DEFAULT_TITLE
  }, [pathname])
}

function Loading() {
  return (
    <div className="page-loading">
      <div className="loading-spinner"></div>
      <p>加载中...</p>
    </div>
  )
}

export default function App() {
  useDocumentTitle()

  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/staking" element={<Staking />} />
          <Route path="/team" element={<Team />} />
          <Route path="/exchange" element={<Exchange />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/records" element={<Records />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
