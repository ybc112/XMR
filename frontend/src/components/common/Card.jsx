import React from 'react'

export default function Card({ children, className = '', title, subtitle, icon, action, glow = false, featured = false }) {
  const featuredClass = featured ? 'card-featured' : (glow ? 'card-featured-top' : '')

  return (
    <div className={`card ${featuredClass} ${className}`}>
      {(title || action) && (
        <div className="card-header">
          <div className="card-title-wrapper">
            {icon && <span className="card-icon">{icon}</span>}
            <div>
              {title && <h3 className="card-title">{title}</h3>}
              {subtitle && <p className="card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  )
}
