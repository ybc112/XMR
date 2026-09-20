import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { Web3Provider } from './contexts/Web3Context.jsx'
import { ToastProvider } from './components/common/Toast.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import './styles/global.css'
import './styles/mobile.css'
import './styles/dark-tech-theme.css'
import './styles/premium-effects.css'

// 路由 basename：主网部署在根路径（默认 ''）；测试网子路径部署时用 VITE_ROUTER_BASE 指定（如 /testnet）
const ROUTER_BASE = import.meta.env.VITE_ROUTER_BASE || ''

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={ROUTER_BASE}>
        <ToastProvider>
          <Web3Provider>
            <App />
          </Web3Provider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
