import React, { useEffect, useRef, useState, useMemo } from 'react'

/**
 * 数字滚动动画组件：数值变化时从旧值平滑滚动到新值
 * value 支持数字、BigInt 或带千分位的字符串（如 "1,234.5678"）
 * 对非法值（NaN/Infinity/空值）自动降级显示为 0
 */
export default function AnimatedNumber({ value, decimals = 4, duration = 900, className = '' }) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)
  const rafRef = useRef(null)

  const target = useMemo(() => {
    try {
      if (value === undefined || value === null || value === '' || value === '-') return 0
      if (typeof value === 'bigint') {
        try {
          return Number(value)
        } catch {
          return Number(value.toString())
        }
      }
      const str = String(value).replace(/,/g, '').replace(/[^\d.\-eE]/g, '')
      if (str === '' || str === '-') return 0
      const num = parseFloat(str)
      if (!Number.isFinite(num)) return 0
      // 避免超大数字导致 toLocaleString 异常
      if (Math.abs(num) > 1e15) return Math.sign(num) * 1e15
      return num
    } catch {
      return 0
    }
  }, [value])

  useEffect(() => {
    const from = Number.isFinite(prevRef.current) ? prevRef.current : 0
    const to = target
    prevRef.current = to

    if (from === to || !Number.isFinite(to)) {
      setDisplay(to)
      return
    }

    // 尊重系统"减少动态效果"设置
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to)
      return
    }

    const start = performance.now()
    const tick = (now) => {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + (to - from) * eased
      setDisplay(Number.isFinite(current) ? current : to)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  const formatted = useMemo(() => {
    try {
      return display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })
    } catch {
      return Number.isFinite(display) ? display.toFixed(decimals) : '0.0000'
    }
  }, [display, decimals])

  return <span className={className}>{formatted}</span>
}
