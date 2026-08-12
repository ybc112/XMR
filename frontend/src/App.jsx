import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import { useWeb3 } from './contexts/Web3Context.jsx'

const Dashboard = lazy(() => import('./components/dashboard/Dashboard.jsx'))
const Staking = lazy(() => import('./components/staking/Staking.jsx'))
const Team = lazy(() => import('./components/team/Team.jsx'))
const Exchange = lazy(() => import('./components/exchange/Exchange.jsx'))
const Assets = lazy(() => import('./components/assets/Assets.jsx'))
const Admin = lazy(() => import('./components/admin/Admin.jsx'))

function Loading() {
  return (
    <div className="page-loading">
      <div className="loading-spinner"></div>
      <p>加载中...</p>
    </div>
  )
}

function AdminRoute({ children }) {
  const { isAdmin } = useWeb3()
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/staking" element={<Staking />} />
          <Route path="/team" element={<Team />} />
          <Route path="/exchange" element={<Exchange />} />
          <Route path="/assets" element={<Assets />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
