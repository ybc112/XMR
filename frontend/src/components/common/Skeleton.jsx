import React from 'react'

export default function Skeleton({ type = 'text', width, height, circle = false, className = '' }) {
  const style = {}
  if (width) style.width = width
  if (height) style.height = height

  return (
    <div
      className={`skeleton skeleton-${type} ${circle ? 'skeleton-circle' : ''} ${className}`}
      style={style}
    ></div>
  )
}
