import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useWeb3 } from '../../contexts/Web3Context.jsx'

const BOTTOM_TABS = [
  {
    path: '/',
    label: '首页',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    )
  },
  {
    path: '/staking',
    label: '算力',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  },
  {
    path: '/team',
    label: '团队',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  },
  {
    path: '/assets',
    label: '资产',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    )
  }
]

export default function MobileBottomNav() {
  const { isAdmin } = useWeb3()
  const location = useLocation()

  const tabs = isAdmin
    ? [...BOTTOM_TABS, {
        path: '/admin',
        label: '管理',
        icon: () => (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        )
      }]
    : BOTTOM_TABS

  return (
    <nav className="mobile-bottom-nav">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path
        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={`mobile-bottom-tab ${isActive ? 'active' : ''}`}
          >
            {tab.icon(isActive)}
            <span>{tab.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
