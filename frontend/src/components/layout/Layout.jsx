import React from 'react'
import Navbar from './Navbar.jsx'
import MobileBottomNav from './MobileBottomNav.jsx'
import ChatFAB from '../chat/ChatFAB.jsx'

export default function Layout({ children }) {
  return (
    <div className="app-layout">
      <div className="tech-background">
        <div className="bg-noise"></div>
        <div className="bg-particles"></div>
        <div className="bg-glow-top"></div>
        <div className="bg-glow-bottom"></div>
      </div>

      <Navbar />

      <main className="main-content">
        {children}
      </main>

      <footer className="app-footer">
        <p>Monero Stake &copy; 2026 | Private Wealth Protocol</p>
      </footer>

      <MobileBottomNav />
      <ChatFAB />
    </div>
  )
}
