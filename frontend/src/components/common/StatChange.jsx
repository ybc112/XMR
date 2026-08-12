import React from 'react'

export default function StatChange({ value, direction = 'up', className = '' }) {
  const isUp = direction === 'up'

  return (
    <span className={`stat-change ${isUp ? 'stat-change-up' : 'stat-change-down'} ${className}`}>
      {isUp ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M12 19V5M5 12L12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19M19 12L12 19L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {value}
    </span>
  )
}
