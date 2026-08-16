import React, { useState } from 'react'

export default function Tabs({ tabs, defaultActive = 0, active: controlledActive, onChange, className = '' }) {
  const [innerActive, setInnerActive] = useState(defaultActive)
  const isControlled = controlledActive !== undefined && controlledActive !== null
  const active = isControlled ? controlledActive : innerActive

  const handleSelect = (idx) => {
    if (!isControlled) setInnerActive(idx)
    if (onChange) onChange(idx)
  }

  return (
    <div className={`tabs ${className}`}>
      <div className="tab-list">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            className={`tab-item ${active === idx ? 'tab-item-active' : ''}`}
            onClick={() => handleSelect(idx)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs[active]?.content !== undefined && tabs[active]?.content !== null && (
        <div className="tab-panel">
          {tabs[active].content}
        </div>
      )}
    </div>
  )
}
