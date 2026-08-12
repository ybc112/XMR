import React from 'react'

export default function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  className = '',
  fullWidth = false,
  icon
}) {
  const variantClass = `btn-${variant}`
  const sizeClass = `btn-${size}`

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn ${variantClass} ${sizeClass} ${fullWidth ? 'btn-full' : ''} ${className}`}
    >
      {loading ? (
        <>
          <span className="btn-spinner"></span>
          <span>处理中...</span>
        </>
      ) : (
        <>
          {icon && <span className="btn-icon">{icon}</span>}
          {children}
        </>
      )}
    </button>
  )
}
