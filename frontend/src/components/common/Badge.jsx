import React from 'react'

export default function Badge({ children, variant = 'gold', className = '' }) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {children}
    </span>
  )
}
