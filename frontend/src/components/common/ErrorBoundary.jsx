import React from 'react'

/**
 * 全局错误边界：捕获子组件渲染错误，防止整个页面空白
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary 捕获到错误:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-loading" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: '16px', color: '#B8860B' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 8V13M12 16H12.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
            页面渲染出现异常
          </h2>
          <p style={{ color: '#64748B', marginBottom: '24px', maxWidth: '420px', margin: '0 auto 24px' }}>
            某个组件加载失败，请尝试刷新页面。如果合约尚未部署，也可能导致数据加载异常。
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#fff',
                color: '#0F172A',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              重试
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                background: '#0F172A',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              刷新页面
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre
              style={{
                marginTop: '24px',
                padding: '16px',
                background: '#F1F5F9',
                borderRadius: '10px',
                textAlign: 'left',
                fontSize: '12px',
                color: '#64748B',
                overflow: 'auto',
                maxWidth: '640px',
                margin: '24px auto 0'
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
