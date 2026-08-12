import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { formatAddress } from '../../utils/format.js'
import { NAV_ITEMS } from '../../utils/constants.js'

export default function Navbar() {
  const { account, isConnected, isConnecting, connectWallet, disconnectWallet, isAdmin } = useWeb3()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location])

  const handleConnect = () => {
    if (isConnected) {
      disconnectWallet()
    } else {
      connectWallet()
    }
  }

  const filteredNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <header className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <div className="navbar-container">
        <div className="navbar-logo">
          <div className="logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L20 6V12C20 17 16 20 12 22C8 20 4 17 4 12V6L12 2Z"
                stroke="#B8860B"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3" stroke="#B8860B" strokeWidth="2" />
            </svg>
          </div>
          <span className="logo-text">Monero <span>Stake</span></span>
        </div>

        <nav className="navbar-nav">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link-active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar-wallet">
          <button
            className="wallet-pill"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnected ? (
              <>
                <span className="wallet-dot"></span>
                {formatAddress(account)}
              </>
            ) : (
              '连接钱包'
            )}
          </button>
        </div>

        <button
          className="navbar-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            {mobileOpen ? (
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="navbar-mobile">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-link-mobile ${isActive ? 'nav-link-active' : ''}`
              }
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  )
}
