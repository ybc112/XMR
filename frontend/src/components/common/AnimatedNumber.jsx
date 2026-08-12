import React, { useEffect, useRef, useState } from 'react'

/**
 * 数字滚动动画组件：数值变化时从旧值平滑滚动到新值
 * value 支持数字或带千分位的字符串（如 "1,234.5678"）
 */
export default function AnimatedNumber({ value, decimals = 4, duration = 900, className = '' }) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(null)
  const rafRef = useRef(null)

  const parse = (v) => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0

  useEffect(() => {
    const to = parse(value)
    const from = prevRef.current ?? to
    prevRef.current = to
    if (from === to) {
      setDisplay(to)
      return
    }

    // 尊重系统"减少动态效果"设置
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to)
      return
    }

    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return (
    <span className={className}>
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })}
    </span>
  )
}
