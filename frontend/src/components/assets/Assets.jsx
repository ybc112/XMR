import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../common/Card.jsx'
import Button from '../common/Button.jsx'
import Input from '../common/Input.jsx'
import Modal from '../common/Modal.jsx'
import Badge from '../common/Badge.jsx'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { useStaking } from '../../hooks/useStaking.js'
import { useToast } from '../common/Toast.jsx'
import AnimatedNumber from '../common/AnimatedNumber.jsx'
import { formatNumber, formatAddress, formatEther, safeParseFloat, parseContractError } from '../../utils/format.js'

const XMR_ADDRESS_REGEX = /^[48][0-9A-Za-z]{94,105}$/

export default function Assets() {
  const navigate = useNavigate()
  const { account, isConnected, connectWallet } = useWeb3()
  const {
    getUserInfo,
    getContractStats,
    withdrawUSDT,
    requestXMRWithdrawal,
    setXMRAddress
  } = useStaking()
  const { showSuccess, showError } = useToast()

  const [userInfo, setUserInfo] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const [usdtModalOpen, setUsdtModalOpen] = useState(false)
  const [usdtAmount, setUsdtAmount] = useState('')
  const [withdrawingUsdt, setWithdrawingUsdt] = useState(false)

  const [xmrModalOpen, setXmrModalOpen] = useState(false)
  const [xmrAmount, setXmrAmount] = useState('')
  const [withdrawingXmr, setWithdrawingXmr] = useState(false)

  const [xmrAddrInput, setXmrAddrInput] = useState('')
  const [editingXmrAddr, setEditingXmrAddr] = useState(false)
  const [savingXmrAddr, setSavingXmrAddr] = useState(false)

  const loadData = useCallback(async () => {
    if (!account) return
    try {
      const [info, contractStats] = await Promise.all([
        getUserInfo(account),
        getContractStats()
      ])
      setUserInfo(info)
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

  const handleWithdrawUSDT = async () => {
    if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
      showError('请输入提现金额')
      return
    }
    const amount = parseFloat(usdtAmount)
    if (amount % 10 !== 0) {
      showError('提现金额必须是 10 的整数倍')
      return
    }
    setWithdrawingUsdt(true)
    try {
      await withdrawUSDT(usdtAmount)
      showSuccess('USDT提现成功')
      setUsdtAmount('')
      setUsdtModalOpen(false)
      await loadData()
    } catch (err) {
      console.error('USDT提现失败:', err)
      showError(parseContractError(err, 'USDT提现失败'))
    } finally {
      setWithdrawingUsdt(false)
    }
  }

  const handleRequestXMRWithdrawal = async () => {
    if (!xmrAddr) {
      showError('请先添加 XMR 收款地址')
      return
    }
    if (!xmrAmount || parseFloat(xmrAmount) <= 0) {
      showError('请输入提现数量')
      return
    }
    setWithdrawingXmr(true)
    try {
      await requestXMRWithdrawal(xmrAmount)
      showSuccess('XMR提现请求已提交')
      setXmrAmount('')
      setXmrModalOpen(false)
      await loadData()
    } catch (err) {
      console.error('XMR提现请求失败:', err)
      showError(parseContractError(err, 'XMR提现请求失败'))
    } finally {
      setWithdrawingXmr(false)
    }
  }

  const handleSetXMRAddress = async () => {
    const addr = xmrAddrInput.trim()
    if (!XMR_ADDRESS_REGEX.test(addr)) {
      showError('XMR 收款地址格式不正确（标准地址以 4 或 8 开头，95~106 位）')
      return
    }
    setSavingXmrAddr(true)
    try {
      await setXMRAddress(addr)
      showSuccess('XMR 收款地址已保存')
      setEditingXmrAddr(false)
      setXmrAddrInput('')
      await loadData()
    } catch (err) {
      console.error('保存 XMR 地址失败:', err)
      showError(parseContractError(err, '保存 XMR 地址失败'))
    } finally {
      setSavingXmrAddr(false)
    }
  }

  const setQuickUSDT = (amount) => {
    const pending = userInfo ? safeParseFloat(formatEther(userInfo.pendingUSDT)) : 0
    if (amount === 'max') {
      setUsdtAmount(String(Math.floor(pending / 10) * 10))
      return
    }
    if (pending >= amount) setUsdtAmount(String(amount))
    else showError('可提现余额不足')
  }

  const setMaxUSDT = () => {
    setQuickUSDT('max')
  }

  const setMaxXMR = () => {
    if (userInfo) {
      setXmrAmount(formatNumber(userInfo.pendingXMR, 4).replace(/,/g, ''))
    }
  }

  const calculateTotalValue = () => {
    if (!userInfo) return 0
    const usdtValue = safeParseFloat(formatEther(userInfo.pendingUSDT))
    const xmrValue = safeParseFloat(formatEther(userInfo.pendingXMR)) * safeParseFloat(stats ? formatEther(stats.xmrPrice) : '0')
    return Number.isFinite(usdtValue + xmrValue) ? usdtValue + xmrValue : 0
  }

  if (!isConnected) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">资产</h1>
        </div>
        <Card title="连接钱包">
          <div className="connect-prompt">
            <p>请先连接钱包查看资产</p>
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

  const pendingUSDT = userInfo ? formatNumber(userInfo.pendingUSDT) : '0.0000'
  const pendingXMR = userInfo ? formatNumber(userInfo.pendingXMR) : '0.0000'
  const xmrPending = userInfo ? formatNumber(userInfo.xmrWithdrawalPending) : '0.0000'
  const totalEarned = userInfo ? formatNumber(userInfo.totalEarned) : '0.0000'
  const totalValue = calculateTotalValue().toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  const xmrPrice = stats ? formatEther(stats.xmrPrice) : '0.0000'
  const hasPendingXMR = userInfo && userInfo.xmrWithdrawalPending > 0n
  const xmrAddr = userInfo?.xmrAddress || ''

  const usdtIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 6V18M8 10H16M8 14H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )

  const xmrIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12L12 16L16 12M8 8L12 12L16 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const walletIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 11H16.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 11V6C2 4.89543 2.89543 4 4 4H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const exchangeIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M7 16V4M7 4L3 8M7 4L11 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8V20M17 20L21 16M17 20L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">资产</h1>
          <p className="page-subtitle">管理您的 USDT 和 XMR 资产</p>
        </div>
      </div>

      <Card
        title="总资产估值"
        subtitle={`XMR 参考价格: 1 XMR = ${xmrPrice} USDT`}
        icon={walletIcon}
        featured
        className="total-value-card"
      >
        <div className="total-value-display">
          <span className="total-value-amount text-gold"><AnimatedNumber value={totalValue} duration={1200} /></span>
          <span className="total-value-unit">USDT</span>
        </div>
        <div className="total-value-breakdown">
          <div className="value-breakdown-item">
            <span className="value-breakdown-label">USDT 资产</span>
            <span className="value-breakdown-value">{pendingUSDT} USDT</span>
          </div>
          <div className="value-breakdown-divider"></div>
          <div className="value-breakdown-item">
            <span className="value-breakdown-label">XMR 资产估值</span>
            <span className="value-breakdown-value">{pendingXMR} XMR</span>
          </div>
        </div>
      </Card>

      <div className="assets-grid mt-4">
        <Card
          title="USDT 资产"
          subtitle="可随时提取至钱包"
          icon={usdtIcon}
          featured
        >
          <div className="asset-balance">
            <span className="asset-balance-value text-green">{pendingUSDT}</span>
            <span className="asset-balance-unit">USDT</span>
          </div>
          <div className="asset-meta">
            <span>可提现余额</span>
            <Badge variant="green">稳定币</Badge>
          </div>
          <Button
            variant="primary"
            fullWidth
              onClick={() => setUsdtModalOpen(true)}
              disabled={userInfo && (userInfo.pendingUSDT === 0n || userInfo.isBlacklisted)}
            >
              {userInfo?.isBlacklisted ? '账户已被拉黑' : '提现 USDT'}
            </Button>
        </Card>

        <Card
          title="XMR 资产"
          subtitle="隐私资产，可闪兑或提现"
          icon={xmrIcon}
          featured
        >
          <div className="asset-balance">
            <span className="asset-balance-value text-amber">{pendingXMR}</span>
            <span className="asset-balance-unit">XMR</span>
          </div>
          <div className="asset-meta">
            <span>可操作余额</span>
            <Badge variant="gold">隐私币</Badge>
          </div>

          <div className="xmr-address-block">
            <div className="xmr-address-header">
              <span className="xmr-address-label">XMR 收款地址</span>
              {xmrAddr && !editingXmrAddr && (
                <button
                  type="button"
                  className="xmr-address-edit-btn"
                  onClick={() => { setEditingXmrAddr(true); setXmrAddrInput(xmrAddr) }}
                >
                  修改
                </button>
              )}
            </div>
            {xmrAddr && !editingXmrAddr ? (
              <div className="xmr-address-value" title={xmrAddr}>
                {xmrAddr.slice(0, 12)}...{xmrAddr.slice(-10)}
              </div>
            ) : (
              <div className="xmr-address-form">
                <input
                  type="text"
                  className="xmr-address-input"
                  value={xmrAddrInput}
                  onChange={(e) => setXmrAddrInput(e.target.value)}
                  placeholder="输入门罗链收款地址（以 4 或 8 开头）"
                  spellCheck={false}
                />
                <Button
                  variant="accent"
                  size="small"
                  onClick={handleSetXMRAddress}
                  loading={savingXmrAddr}
                >
                  保存地址
                </Button>
              </div>
            )}
            {!xmrAddr && (
              <p className="xmr-address-tip">提现 XMR 前必须先绑定门罗链收款地址</p>
            )}
          </div>

          <div className="asset-actions">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setXmrModalOpen(true)}
              disabled={userInfo && (userInfo.pendingXMR === 0n || !xmrAddr || userInfo.isBlacklisted)}
            >
              {userInfo?.isBlacklisted ? '账户已被拉黑' : xmrAddr ? '提现 XMR' : '请先添加 XMR 收款地址'}
            </Button>
            <Button
              variant="accent"
              fullWidth
              onClick={() => navigate('/exchange')}
              disabled={userInfo && (userInfo.pendingXMR === 0n || userInfo.isBlacklisted)}
              icon={exchangeIcon}
            >
              {userInfo?.isBlacklisted ? '账户已被拉黑' : '闪兑 USDT'}
            </Button>
          </div>
        </Card>

        <Card
          title="XMR 提现状态"
          subtitle="当前处理进度"
        >
          <div className="withdrawal-summary">
            <div className={`withdrawal-summary-icon ${hasPendingXMR ? 'withdrawal-summary-icon-pending' : 'withdrawal-summary-icon-idle'}`}>
              {hasPendingXMR ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div className="withdrawal-summary-info">
              <span className="withdrawal-summary-label">
                {hasPendingXMR ? '处理中' : '无待处理'}
              </span>
              <span className="withdrawal-summary-amount">{xmrPending} XMR</span>
            </div>
          </div>
          <div className="withdrawal-steps">
            <div className={`withdrawal-step ${hasPendingXMR ? 'withdrawal-step-completed' : 'withdrawal-step-completed'}`}>
              <div className="withdrawal-step-dot"></div>
              <span>提交请求</span>
            </div>
            <div className={`withdrawal-step ${hasPendingXMR ? 'withdrawal-step-active' : ''}`}>
              <div className="withdrawal-step-dot"></div>
              <span>管理员审核</span>
            </div>
            <div className={`withdrawal-step ${hasPendingXMR ? '' : 'withdrawal-step-completed'}`}>
              <div className="withdrawal-step-dot"></div>
              <span>完成转账</span>
            </div>
          </div>
          {hasPendingXMR && (
            <div className="withdrawal-processing-notice">
              <span className="processing-dot"></span>
              您的 XMR 提现请求正在处理中，请耐心等待管理员审核
            </div>
          )}
        </Card>
      </div>

      <Card
        title="资产明细"
        className="mt-4"
        action={
          <Button variant="outline" size="small" onClick={() => navigate('/records')}>
            资金明细 →
          </Button>
        }
      >
        <div className="info-list">
          <div className="info-row">
            <span className="info-label">钱包地址</span>
            <span className="info-value text-mono">{formatAddress(account)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">可提现 USDT</span>
            <span className="info-value text-green">{pendingUSDT} USDT</span>
          </div>
          <div className="info-row">
            <span className="info-label">可操作 XMR</span>
            <span className="info-value text-amber">{pendingXMR} XMR</span>
          </div>
          <div className="info-row">
            <span className="info-label">XMR 参考价格</span>
            <span className="info-value text-gold">{xmrPrice} USDT</span>
          </div>
          <div className="info-row">
            <span className="info-label">待处理 XMR 提现</span>
            <span className="info-value text-gold">{xmrPending} XMR</span>
          </div>
          <div className="info-row">
            <span className="info-label">累计总收益</span>
            <span className="info-value">{totalEarned} USDT</span>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={usdtModalOpen}
        onClose={() => setUsdtModalOpen(false)}
        title="提现 USDT"
        footer={
          <div className="modal-footer-actions">
            <Button variant="outline" onClick={() => setUsdtModalOpen(false)}>取消</Button>
            <Button variant="primary" onClick={handleWithdrawUSDT} loading={withdrawingUsdt}>
              确认提现
            </Button>
          </div>
        }
      >
        <div className="modal-form">
          <Input
            label="提现金额"
            value={usdtAmount}
            onChange={(e) => setUsdtAmount(e.target.value)}
            placeholder="输入提现金额"
            type="number"
            suffix="USDT"
            hint={`可提现余额: ${pendingUSDT} USDT · 提现金额必须是 10 的整数倍`}
          />
          <div className="quick-amounts">
            {[10, 50, 100].map((amount) => (
              <button key={amount} type="button" className="quick-amount-btn" onClick={() => setQuickUSDT(amount)}>
                {amount}
              </button>
            ))}
            <button type="button" className="quick-amount-btn" onClick={() => setQuickUSDT('max')}>
              最大
            </button>
          </div>
          <button className="max-btn" onClick={setMaxUSDT}>全部提现</button>
          <div className="modal-tip">
            <p>提现将直接转入您的钱包地址</p>
            <p>请确认网络状态后再操作</p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={xmrModalOpen}
        onClose={() => setXmrModalOpen(false)}
        title="提现 XMR"
        footer={
          <div className="modal-footer-actions">
            <Button variant="outline" onClick={() => setXmrModalOpen(false)}>取消</Button>
            <Button variant="primary" onClick={handleRequestXMRWithdrawal} loading={withdrawingXmr}>
              提交提现请求
            </Button>
          </div>
        }
      >
        <div className="modal-form">
          {xmrAddr ? (
            <div className="xmr-modal-address">
              收款地址：{xmrAddr.slice(0, 16)}...{xmrAddr.slice(-8)}
            </div>
          ) : (
            <div className="xmr-modal-address xmr-modal-address-warn">
              尚未绑定 XMR 收款地址，请先在上方资产卡片中添加
            </div>
          )}
          <Input
            label="提现数量"
            value={xmrAmount}
            onChange={(e) => setXmrAmount(e.target.value)}
            placeholder="输入提现数量"
            type="number"
            suffix="XMR"
            hint={`可提现余额: ${pendingXMR} XMR`}
          />
          <button className="max-btn" onClick={setMaxXMR}>全部提现</button>
          <div className="modal-tip">
            <p>XMR 提现需要管理员审核处理</p>
            <p>提交后请耐心等待处理结果</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
