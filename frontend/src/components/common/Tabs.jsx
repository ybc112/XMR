import React, { useState } from 'react'

export default function Tabs({ tabs, defaultActive = 0, className = '' }) {
  const [active, setActive] = useState(defaultActive)

  return (
    <div className={`tabs ${className}`}>
      <div className="tab-list">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            className={`tab-item ${active === idx ? 'tab-item-active' : ''}`}
            onClick={() => setActive(idx)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-panel">
        {tabs[active]?.content}
      </div>
    </div>
  )
}
