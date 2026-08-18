import React, { useState, useEffect, useCallback } from 'react'
import Card from '../common/Card.jsx'
import Button from '../common/Button.jsx'
import Input from '../common/Input.jsx'
import Tabs from '../common/Tabs.jsx'
import ProgressBar from '../common/ProgressBar.jsx'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { useStaking } from '../../hooks/useStaking.js'
import { useContracts } from '../../hooks/useContracts.js'
import { useToast } from '../common/Toast.jsx'
import { formatNumber, formatEther, getLevelName, formatAddress, safeNumber, parseContractError } from '../../utils/format.js'
import { ethers } from 'ethers'

export default function Staking() {
  const { account, isConnected, connectWallet } = useWeb3()
  const { register, invest, getUserInfo, getContractStats } = useStaking()
  const { getUSDTBalance } = useContracts()
  const { showSuccess, showError, showInfo } = useToast()

  const [userInfo, setUserInfo] = useState(null)
  const [usdtBalance, setUsdtBalance] = useState(0n)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const [referrer, setReferrer] = useState('')
  const [registering, setRegistering] = useState(false)

  const [investAmount, setInvestAmount] = useState('')
  const [investing, setInvesting] = useState(false)

  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    if (!account) return
    try {
      const [info, balance, contractStats] = await Promise.all([
        getUserInfo(account),
        getUSDTBalance(account),
        getContractStats()
      ])
      setUserInfo(info)
      setUsdtBalance(balance)
      setStats(contractStats)
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [account, getUserInfo, getUSDTBalance, getContractStats])

  useEffect(() => {
    if (isConnected && account) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [isConnected, account, loadData])

  // 邀请链接 ?ref=0x... 自动填充推荐人（排除自己的地址）
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (!ref || !ethers.isAddress(ref)) return
    if (account && ref.toLowerCase() === account.toLowerCase()) return
    setReferrer(ref)
  }, [account])

  const handleRegister = async () => {
    const trimmed = referrer.trim()
    // 推荐人留空 => 传 address(0)，作为创世用户注册（合约允许 _referrer == address(0)）
    const referrerAddr = trimmed === '' ? ethers.ZeroAddress : trimmed

    if (trimmed !== '') {
      if (!ethers.isAddress(trimmed)) {
        showError('推荐人地址格式不正确')
        return
      }
      if (trimmed.toLowerCase() === account.toLowerCase()) {
        showError('不能填写自己的地址作为推荐人，第一个注册的用户请留空')
        return
      }
      const refInfo = await getUserInfo(trimmed).catch(() => null)
      if (!refInfo?.isRegistered) {
        showError('该推荐人尚未注册，请确认地址或留空作为第一个用户注册')
        return
      }
    }

    setRegistering(true)
    try {
      await register(referrerAddr)
      showSuccess(referrerAddr === ethers.ZeroAddress ? '注册成功！您是第一个用户' : '注册成功！')
      await loadData()
    } catch (err) {
      console.error('注册失败:', err)
      showError(parseContractError(err, '注册失败'))
    } finally {
      setRegistering(false)
    }
  }

  const handleInvest = async () => {
    if (!investAmount || parseFloat(investAmount) <= 0) {
      showError('请输入投资金额')
      return
    }
    const amount = parseFloat(investAmount)
    if (amount < 100) {
      showError('最低投资 100 USDT')
      return
    }
    if (amount % 100 !== 0) {
      showError('投资金额必须是 100 的整数倍')
      return
    }
    if (userInfo?.exited) {
      const pendingUsdt = userInfo.pendingUSDT > 0n ? formatEther(userInfo.pendingUSDT) : '0'
      const pendingXmr = userInfo.pendingXMR > 0n ? formatEther(userInfo.pendingXMR) : '0'
      const ok = window.confirm(
        `您已出局，复投将开启新一轮：\n\n` +
        `· 累计收益清零，出局额度按新本金重新计算\n` +
        `· 待提现 USDT 余额（${Number(pendingUsdt).toFixed(2)}）将被清零\n` +
        `· 待提现 XMR 余额（${Number(pendingXmr).toFixed(2)}）将被清零\n\n` +
        `如有未提现余额请先提现再复投。确认复投？`
      )
      if (!ok) return
    }
    setInvesting(true)
    try {
      showInfo('正在处理投资交易...')
      await invest(investAmount)
      showSuccess('投资成功！')
      setInvestAmount('')
      await loadData()
    } catch (err) {
      console.error('投资失败:', err)
      showError(parseContractError(err, '投资失败'))
    } finally {
      setInvesting(false)
    }
  }

  const handleCopyInvite = () => {
    if (!account) return
    const link = `${window.location.origin}?ref=${account}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    showSuccess('邀请链接已复制')
    setTimeout(() => setCopied(false), 2000)
  }

  const progressValue = userInfo ? safeNumber(formatEther(userInfo.totalEarned)) : 0
  const progressMax = userInfo && userInfo.exitLimit > 0n ? safeNumber(formatEther(userInfo.exitLimit)) : 1

  const estimateExitMultiplier = () => {
    if (!userInfo || userInfo.personalAmount === 0n) return 3
    const exitLimit = safeNumber(formatEther(userInfo.exitLimit))
    const personal = safeNumber(formatEther(userInfo.personalAmount))
    return personal > 0 ? exitLimit / personal : 3
  }

  const estimatedExitLimit = investAmount && parseFloat(investAmount) > 0
    ? parseFloat(investAmount) * estimateExitMultiplier()
    : 0

  if (!isConnected) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">算力</h1>
        </div>
        <Card title="连接钱包" featured>
          <div className="connect-prompt">
            <p>请先连接钱包以使用算力功能</p>
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

  const isRegistered = userInfo?.isRegistered
  const inviteLink = account ? `${window.location.origin}?ref=${account}` : ''

  const registerTab = {
    label: '注册',
    content: (
      <div className="form-section">
        <Input
          label="推荐人地址（选填）"
          value={referrer}
          onChange={(e) => setReferrer(e.target.value)}
          placeholder="0x... 没有推荐人请留空"
          hint={
            stats && Number(stats.totalUsers) === 0
              ? '当前还没有任何用户注册，您将成为第一个用户，请直接留空点击注册'
              : '填写推荐人钱包地址；若您是第一个用户请留空'
          }
        />
        <Button
          variant="primary"
          fullWidth
          onClick={handleRegister}
          loading={registering}
        >
          立即注册
        </Button>
      </div>
    )
  }

  const investTab = {
    label: '投资',
    content: isRegistered ? (
      <div className="form-section">
        <Input
          label="投资金额"
          value={investAmount}
          onChange={(e) => setInvestAmount(e.target.value)}
          placeholder="输入投资金额"
          type="number"
          suffix="USDT"
          hint={`可用余额: ${formatNumber(usdtBalance)} USDT`}
        />
        <div className="quick-amounts">
          {[100, 500, 1000, 5000].map((amt) => (
            <button
              key={amt}
              className="quick-amount-btn"
              onClick={() => setInvestAmount(amt.toString())}
            >
              {amt}
            </button>
          ))}
          <button
            className="quick-amount-btn"
            onClick={() => setInvestAmount(formatEther(usdtBalance))}
          >
            最大
          </button>
        </div>
        {parseFloat(investAmount) > 0 && (
          <div className="estimate-exit-box">
            <span className="estimate-exit-label">预计出局额度</span>
            <span className="estimate-exit-value">{estimatedExitLimit.toFixed(4)} USDT</span>
            <span className="estimate-exit-hint">约为投资金额的 {estimateExitMultiplier().toFixed(2)} 倍</span>
          </div>
        )}
        <Button
          variant="primary"
          fullWidth
          onClick={handleInvest}
          loading={investing}
          disabled={userInfo.isBlacklisted}
        >
          {userInfo.isBlacklisted ? '账户已被拉黑' : userInfo.exited ? '复投重启' : '确认投资'}
        </Button>
        {userInfo.exited && (
          <p className="text-warning text-center mt-2">您已出局：复投将清零累计收益与待提余额，开启新一轮</p>
        )}
        <p className="form-tip">* 投资前系统会自动检查并处理USDT授权</p>
      </div>
    ) : (
      <div className="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#64748B" strokeWidth="1.5" />
          <path d="M12 8V12M12 16H12.01" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p>请先完成注册</p>
      </div>
    )
  }

  const xmrTab = {
    label: 'XMR',
    content: (
      <div className="form-section">
        <div className="xmr-auto-card">
          <svg className="xmr-logo" width="56" height="56" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" fill="#F26822" />
            <path d="M4.8 17.2V9.2L8 12.4L12 6.8L16 12.4L19.2 9.2V17.2H16.4V13.6L12 18.2L7.6 13.6V17.2H4.8Z" fill="#fff" />
          </svg>
          <p className="xmr-auto-title">收益自动发放</p>
          <p className="xmr-auto-desc">静态收益与团队奖励按周期自动结算到账（XMR），无需手动领取</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">算力</h1>
        <p className="page-subtitle">注册、投资，收益自动发放到账</p>
      </div>

      <div className="step-indicator">
        <div className={`step ${isRegistered ? 'step-completed' : 'step-active'}`}>
          <span className="step-number">1</span>
          <span>注册</span>
        </div>
        <div className="step-divider"></div>
        <div className={`step ${isRegistered ? 'step-active' : ''}`}>
          <span className="step-number">2</span>
          <span>投资算力</span>
        </div>
        <div className="step-divider"></div>
        <div className={`step ${isRegistered ? 'step-active' : ''}`}>
          <span className="step-number step-number-xmr">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="11" fill="#F26822" />
              <path d="M4.8 17.2V9.2L8 12.4L12 6.8L16 12.4L19.2 9.2V17.2H16.4V13.6L12 18.2L7.6 13.6V17.2H4.8Z" fill="#fff" />
            </svg>
          </span>
          <span>自动发放</span>
        </div>
      </div>

      <div className="staking-grid">
        <Card title="算力操作" subtitle={isRegistered ? `USDT 余额: ${formatNumber(usdtBalance)}` : '完成注册后即可投资'} featured>
          <Tabs tabs={[registerTab, investTab, xmrTab]} defaultActive={isRegistered ? 1 : 0} />
        </Card>

        <Card title="投资概览" subtitle={isRegistered ? getLevelName(userInfo.level) : '未注册'}>
          {isRegistered ? (
            <>
              <ProgressBar
                label="出局进度"
                value={progressValue.toFixed(4)}
                max={progressMax.toFixed(4)}
                suffix="USDT"
                variant="gold"
              />
              <div className="info-list mt-3">
                <div className="info-row">
                  <span className="info-label">会员ID</span>
                  <span className="info-value">#{Number(userInfo.memberId)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">个人投资总额</span>
                  <span className="info-value text-gold">{formatNumber(userInfo.personalAmount)} USDT</span>
                </div>
                <div className="info-row">
                  <span className="info-label">累计总收益</span>
                  <span className="info-value text-green">{formatNumber(userInfo.totalEarned)} USDT</span>
                </div>
                <div className="info-row">
                  <span className="info-label">出局额度</span>
                  <span className="info-value">{formatNumber(userInfo.exitLimit)} USDT</span>
                </div>
                <div className="info-row">
                  <span className="info-label">出局状态</span>
                  <span className="info-value">
                    {userInfo.exited ? (
                      <span className="status-tag status-tag-danger">已出局</span>
                    ) : (
                      <span className="status-tag status-tag-success">进行中</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="invite-link-box">
                <span className="invite-link-label">我的邀请链接</span>
                <div className="invite-link-value">
                  <span className="text-mono">{formatAddress(account)}</span>
                  <Button
                    variant="outline"
                    size="small"
                    onClick={handleCopyInvite}
                  >
                    {copied ? '已复制' : '复制链接'}
                  </Button>
                </div>
                <span className="invite-link-hint">{inviteLink}</span>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#64748B" strokeWidth="1.5" />
                <path d="M12 8V12M12 16H12.01" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p>完成注册后查看投资概览</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
