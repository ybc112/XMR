import React from 'react'

export default function ProgressBar({ label, value, max, suffix = '', variant = 'gold', className = '' }) {
  const progress = max > 0 ? Math.min((Number(value) / Number(max)) * 100, 100) : 0

  return (
    <div className={`progress-bar ${className}`}>
      <div className="progress-label">
        <span>{label}</span>
        <span>{value} {suffix} / {max} {suffix}</span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill ${variant === 'green' ? 'progress-fill-green' : ''}`}
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  )
}
