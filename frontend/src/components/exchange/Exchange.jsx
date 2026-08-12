import React, { useState, useEffect, useCallback } from 'react'
import Card from '../common/Card.jsx'
import Button from '../common/Button.jsx'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { useStaking } from '../../hooks/useStaking.js'
import { useToast } from '../common/Toast.jsx'
import { formatNumber, formatEther } from '../../utils/format.js'
import { ethers } from 'ethers'

export default function Exchange() {
  const { account, isConnected, connectWallet } = useWeb3()
  const { getUserInfo, getContractStats, flashExchange } = useStaking()
  const { showSuccess, showError, showInfo } = useToast()

  const [userInfo, setUserInfo] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exchanging, setExchanging] = useState(false)

  const [xmrAmount, setXmrAmount] = useState('')

  const loadData = useCallback(async () => {
    if (!account) return
    setLoading(true)
    try {
      const info = await getUserInfo(account)
      setUserInfo(info)

      const contractStats = await getContractStats()
      setStats(contractStats)
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [account, getUserInfo, getContractStats])

  useEffect(() => {
    if (isConnected && account) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [isConnected, account, loadData])

  const calculateUsdt = () => {
    if (!xmrAmount || !stats) return '0.0000'
    try {
      const xmrWei = ethers.parseEther(xmrAmount)
      const price = stats.xmrPrice
      const usdtWei = (xmrWei * price) / ethers.parseEther('1')
      return formatNumber(usdtWei)
    } catch {
      return '0.0000'
    }
  }

  const handleFlashExchange = async () => {
    if (!xmrAmount || parseFloat(xmrAmount) <= 0) {
      showError('请输入闪兑数量')
      return
    }

    const pendingXmr = userInfo ? userInfo.pendingXMR : 0n
    const inputWei = ethers.parseEther(xmrAmount)
    if (inputWei > pendingXmr) {
      showError('闪兑数量超过可用XMR余额')
      return
    }

    setExchanging(true)
    try {
      showInfo('正在处理闪兑交易...')
      await flashExchange(xmrAmount)
      showSuccess('闪兑成功！')
      setXmrAmount('')
      await loadData()
    } catch (err) {
      console.error('闪兑失败:', err)
      showError(err.reason || err.message || '闪兑失败')
    } finally {
      setExchanging(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">闪兑</h1>
        </div>
        <Card title="连接钱包" featured>
          <div className="connect-prompt">
            <p>请先连接钱包使用闪兑功能</p>
            <Button variant="primary" onClick={connectWallet}>连接钱包</Button>
          </div>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    )
  }

  const pendingXmr = userInfo ? formatNumber(userInfo.pendingXMR) : '0.0000'
  const pendingUsdt = userInfo ? formatNumber(userInfo.pendingUSDT) : '0.0000'
  const xmrPrice = stats ? formatEther(stats.xmrPrice) : '0.0000'

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">闪兑</h1>
        <p className="page-subtitle">将您的 XMR 收益闪兑为 USDT</p>
      </div>

      <div className="exchange-price-banner">
        <div className="price-banner-item">
          <span className="price-label">当前 XMR 价格</span>
          <span className="price-value text-gold">{xmrPrice} USDT</span>
        </div>
        <div className="price-banner-divider"></div>
        <div className="price-banner-item">
          <span className="price-label">XMR 余额</span>
          <span className="price-value">{pendingXmr} XMR</span>
        </div>
        <div className="price-banner-divider"></div>
        <div className="price-banner-item">
          <span className="price-label">USDT 余额</span>
          <span className="price-value text-green">{pendingUsdt} USDT</span>
        </div>
      </div>

      <div className="exchange-container">
        <Card title="XMR 闪兑" subtitle="输入XMR数量，自动计算可获得的USDT" featured>
          <div className="exchange-form">
            <div className="exchange-input-section">
              <label className="input-label">输入 XMR 数量</label>
              <div className="exchange-input-wrapper">
                <input
                  type="number"
                  className="exchange-input"
                  placeholder="0.0000"
                  value={xmrAmount}
                  onChange={(e) => setXmrAmount(e.target.value)}
                />
                <span className="exchange-token">XMR</span>
              </div>
              <div className="exchange-balance">
                <span>可用余额: {pendingXmr} XMR</span>
                <button
                  className="max-btn"
                  onClick={() => setXmrAmount(pendingXmr)}
                >
                  最大
                </button>
              </div>
            </div>

            <div className="exchange-arrow">
              <button className="exchange-arrow-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5V19M5 12L12 19L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="exchange-output-section">
              <label className="input-label">可获得 USDT</label>
              <div className="exchange-output-wrapper">
                <span className="exchange-output-value">{calculateUsdt()}</span>
                <span className="exchange-token">USDT</span>
              </div>
            </div>

            <Button
              variant="accent"
              fullWidth
              onClick={handleFlashExchange}
              loading={exchanging}
              disabled={!xmrAmount || parseFloat(xmrAmount) <= 0 || (userInfo && userInfo.pendingXMR === 0n)}
            >
              确认闪兑
            </Button>

            <div className="exchange-info">
              <div className="exchange-info-row">
                <span>兑换比例</span>
                <span>1 XMR = {xmrPrice} USDT</span>
              </div>
              <div className="exchange-info-row">
                <span>手续费</span>
                <span>0%</span>
              </div>
              <div className="exchange-info-row">
                <span>最小单位</span>
                <span>0.0001 XMR</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
