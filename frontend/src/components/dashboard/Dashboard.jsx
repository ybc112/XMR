import React, { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import Card from '../common/Card.jsx'
import Button from '../common/Button.jsx'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { useStaking } from '../../hooks/useStaking.js'
import AnimatedNumber from '../common/AnimatedNumber.jsx'
import { formatEther, formatNumber, formatAddress, getLevelName, getTxHashUrl, safeNumber, formatDailyRate, formatBasisPoints } from '../../utils/format.js'

export default function Dashboard() {
  const { account, isConnected, connectWallet, isAdmin } = useWeb3()
  const {
    getUserInfo,
    getContractStats,
    getDirectReferralCount,
    estimateStaticReward,
    getRecentEarnings
  } = useStaking()

  const [stats, setStats] = useState(null)
  const [userInfo, setUserInfo] = useState(null)
  const [rewardEst, setRewardEst] = useState({ usdtValue: 0n, xmrValue: 0n })
  const [directCount, setDirectCount] = useState(0)
  const [recentEarnings, setRecentEarnings] = useState([])
  const [earningsLoading, setEarningsLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setEarningsLoading(true)
    try {
      const contractStats = await getContractStats()
      setStats(contractStats)

      if (account) {
        const [info, est, count, earnings] = await Promise.all([
          getUserInfo(account),
          estimateStaticReward(account),
          getDirectReferralCount(account),
          getRecentEarnings(account, 6)
        ])
        setUserInfo(info)
        setRewardEst(est)
        setDirectCount(count)
        setRecentEarnings(earnings)
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
      setEarningsLoading(false)
    }
  }, [account, getContractStats, getUserInfo, estimateStaticReward, getDirectReferralCount, getRecentEarnings])

  useEffect(() => {
    loadData()
  }, [loadData])

  const getEarningLabel = (event) => {
    switch (event.type) {
      case 'StaticRewardClaimed':
        return '静态收益领取'
      case 'GenerationReward':
        return `${event.args.generation}代奖励`
      case 'TeamReward':
        return `团队奖励 (${getLevelName(event.args.level)})`
      case 'FlashExchanged':
        return '闪兑 XMR'
      case 'USDTWithdrawn':
        return 'USDT 提现'
      case 'XMRWithdrawalRequested':
        return 'XMR 提现请求'
      default:
        return event.type
    }
  }

  const getEarningAmount = (event) => {
    try {
      switch (event.type) {
        case 'StaticRewardClaimed':
          return `${formatNumber(event.args.usdtValue)} USDT`
        case 'GenerationReward':
        case 'TeamReward':
          return `${formatNumber(event.args.amount)} USDT`
        case 'FlashExchanged':
          return `${formatNumber(event.args.usdtAmount)} USDT`
        case 'USDTWithdrawn':
          return `${formatNumber(event.args.amount)} USDT`
        case 'XMRWithdrawalRequested':
          return `${formatNumber(event.args.amount)} XMR`
        default:
          return ''
      }
    } catch {
      return ''
    }
  }

  const getEarningIcon = (type) => {
    if (type === 'StaticRewardClaimed' || type === 'GenerationReward' || type === 'TeamReward') {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2V22M17 5H9.5A3.5 3.5 0 009.5 12H14.5A3.5 3.5 0 0114.5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
    if (type === 'FlashExchanged') {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    }
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" />
        <path d="M12 8V12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">仪表盘</h1>
        <p className="page-subtitle">Monero Stake <span className="text-shimmer">全景数据概览</span></p>
      </div>

      {/* 手机端专属：总资产 Hero + 快捷数据 + 功能宫格 */}
      <div className="hide-desktop">
        <div className="total-value-card">
          <div className="total-value-label">预估总资产 (USDT)</div>
          <div className="total-value-amount">
            <AnimatedNumber
              value={
                safeNumber(formatEther(rewardEst.usdtValue)) +
                safeNumber(formatEther(rewardEst.xmrValue)) * safeNumber(stats ? formatEther(stats.xmrPrice) : '0')
              }
              decimals={4}
            />
            <span className="total-value-unit">USDT</span>
          </div>
          <div className="total-value-breakdown">
            <div className="mobile-quick-stats">
              <div className="mobile-quick-stat">
                <div className="mobile-quick-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <div className="mobile-quick-stat-value">{stats ? formatDailyRate(stats.dailyRate, stats.computingPower) : '0.00%'}</div>
                <div className="mobile-quick-stat-label">日化率</div>
              </div>
              <div className="mobile-quick-stat">
                <div className="mobile-quick-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className="mobile-quick-stat-value">
                  {userInfo ? formatNumber(userInfo.personalAmount) : (stats ? Number(stats.computingPower) : 0)}
                </div>
                <div className="mobile-quick-stat-label">算力</div>
              </div>
              <div className="mobile-quick-stat">
                <div className="mobile-quick-stat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
                <div className="mobile-quick-stat-value">{stats ? formatEther(stats.xmrPrice) : '0.0000'}</div>
                <div className="mobile-quick-stat-label">XMR 价格</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mobile-section-title">
          <span>快捷功能</span>
        </div>
        <div className="mobile-menu-grid">
          <NavLink to="/staking" className="mobile-menu-item">
            <div className="mobile-menu-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span className="mobile-menu-label">兑换算力</span>
            <span className="mobile-menu-desc">投资获取收益</span>
          </NavLink>

          <NavLink to="/team" className="mobile-menu-item">
            <div className="mobile-menu-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span className="mobile-menu-label">我的团队</span>
            <span className="mobile-menu-desc">层级与业绩</span>
          </NavLink>

          <NavLink to="/exchange" className="mobile-menu-item">
            <div className="mobile-menu-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
              </svg>
            </div>
            <span className="mobile-menu-label">闪兑 XMR</span>
            <span className="mobile-menu-desc">实时价格兑换</span>
          </NavLink>

          <NavLink to="/assets" className="mobile-menu-item">
            <div className="mobile-menu-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <span className="mobile-menu-label">资产管理</span>
            <span className="mobile-menu-desc">USDT / XMR</span>
          </NavLink>

          <div className="mobile-menu-item mobile-menu-static">
            <div className="mobile-menu-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" fill="#F26822" />
                <path d="M4.8 17.2V9.2L8 12.4L12 6.8L16 12.4L19.2 9.2V17.2H16.4V13.6L12 18.2L7.6 13.6V17.2H4.8Z" fill="#fff" />
              </svg>
            </div>
            <span className="mobile-menu-label">XMR 收益</span>
            <span className="mobile-menu-desc">按周期自动发放</span>
          </div>

          <NavLink to="/staking#invite" className="mobile-menu-item">
            <div className="mobile-menu-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </div>
            <span className="mobile-menu-label">邀请好友</span>
            <span className="mobile-menu-desc">获取层级奖励</span>
          </NavLink>
        </div>
      </div>

      {isConnected && userInfo?.isRegistered && (
        <div className="welcome-banner">
          <div className="welcome-banner-content">
            <h2>欢迎回来，{formatAddress(account)}</h2>
            <p>您的资产正在稳健增长，当前等级为 {getLevelName(userInfo.level)}，继续邀请好友可提升团队奖励。</p>
          </div>
        </div>
      )}

      {isConnected && userInfo?.exited && (
        <div className="exit-alert">
          <div className="exit-alert-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M10.29 3.86L1.82 18C1.645 18.302 1.552 18.645 1.552 18.995C1.552 20.1 2.45 21 3.555 21H20.445C21.55 21 22.448 20.1 22.448 18.995C22.448 18.645 22.355 18.302 22.18 18L13.71 3.86C13.351 3.228 12.69 2.86 12 2.86C11.31 2.86 10.649 3.228 10.29 3.86Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 9V13M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="exit-alert-content">
            <div className="exit-alert-title">您已出局</div>
            <p className="exit-alert-text">出局后无法继续获得静态收益，请重新投资以恢复收益资格。</p>
          </div>
          <Button variant="primary" onClick={() => window.location.href = '/staking'}>
            去复投
          </Button>
        </div>
      )}

      <div className="stats-grid hide-mobile">
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M17 21V19A4 4 0 0013 15H5A4 4 0 001 19V21M9 11A4 4 0 109 3A4 4 0 009 11M23 21V19A4 4 0 0019 15M16 3.13A4 4 0 0116 11.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">总用户数</p>
            <p className="stat-value"><AnimatedNumber value={stats ? Number(stats.totalUsers) : 0} decimals={0} /></p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 1V23M17 5H9.5A3.5 3.5 0 009.5 12H14.5A3.5 3.5 0 0114.5 19H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">总算力金额 (USDT)</p>
            <p className="stat-value"><AnimatedNumber value={stats ? formatNumber(stats.totalUSDTDeposited) : 0} /></p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M12 7V12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">XMR 价格 (USDT)</p>
            <p className="stat-value"><AnimatedNumber value={stats ? formatEther(stats.xmrPrice) : 0} /></p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M23 6L13.5 15.5L8.5 10.5L1 18M23 6H17M23 6V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">日化率</p>
            <p className="stat-value">{stats ? formatDailyRate(stats.dailyRate, stats.computingPower) : '0.00%'}</p>
          </div>
        </div>
      </div>

      {!isConnected ? (
        <Card title="连接钱包" className="connect-card" featured>
          <div className="connect-prompt">
            <p>请连接钱包以查看您的个人数据</p>
            <Button variant="primary" onClick={connectWallet}>
              连接钱包
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="dashboard-grid">
            <Card title="用户信息" icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }>
              <div className="info-list">
                <div className="info-row">
                  <span className="info-label">钱包地址</span>
                  <span className="info-value text-mono">{formatAddress(account)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">会员ID</span>
                  <span className="info-value">#{userInfo ? Number(userInfo.memberId) : '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">个人投资额</span>
                  <span className="info-value">{userInfo ? formatNumber(userInfo.personalAmount) : '0.0000'} USDT</span>
                </div>
                <div className="info-row">
                  <span className="info-label">总收益</span>
                  <span className="info-value text-gold">{userInfo ? formatNumber(userInfo.totalEarned) : '0.0000'} USDT</span>
                </div>
                <div className="info-row">
                  <span className="info-label">出局额度</span>
                  <span className="info-value">{userInfo ? formatNumber(userInfo.exitLimit) : '0.0000'} USDT</span>
                </div>
                <div className="info-row">
                  <span className="info-label">当前等级</span>
                  <span className="info-value">
                    <span className="level-badge">{userInfo ? getLevelName(userInfo.level) : '未注册'}</span>
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">推荐人</span>
                  <span className="info-value text-mono">{userInfo ? formatAddress(userInfo.referrer) : '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">注册状态</span>
                  <span className="info-value">
                    {userInfo?.isRegistered ? (
                      <span className="status-tag status-tag-success">已注册</span>
                    ) : (
                      <span className="status-tag status-tag-warning">未注册</span>
                    )}
                  </span>
                </div>
              </div>
            </Card>

            <Card title="我的团队" icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7ZM23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }>
              <div className="team-stats-grid">
                <div className="team-stat-item">
                  <span className="team-stat-value">{directCount}</span>
                  <span className="team-stat-label">直推人数</span>
                </div>
                <div className="team-stat-item">
                  <span className="team-stat-value">{userInfo ? formatNumber(userInfo.teamTotalVolume) : '0.0000'}</span>
                  <span className="team-stat-label">团队总业绩 (USDT)</span>
                </div>
                <div className="team-stat-item">
                  <span className="team-stat-value">{userInfo ? formatNumber(userInfo.maxAreaVolume) : '0.0000'}</span>
                  <span className="team-stat-label">大区业绩 (USDT)</span>
                </div>
              </div>
            </Card>

            <Card title="最近收益" icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }>
              {earningsLoading ? (
                <div className="page-loading" style={{ minHeight: 160 }}>
                  <div className="loading-spinner"></div>
                </div>
              ) : recentEarnings.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 20px' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p>暂无收益记录</p>
                </div>
              ) : (
                <div className="earnings-list">
                  {recentEarnings.map((event, idx) => (
                    <a
                      key={`${event.transactionHash}-${idx}`}
                      href={getTxHashUrl(event.transactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="earning-item"
                    >
                      <div className="earning-icon">{getEarningIcon(event.type)}</div>
                      <div className="earning-info">
                        <span className="earning-title">{getEarningLabel(event)}</span>
                        <span className="earning-meta">Block {event.blockNumber}</span>
                      </div>
                      <span className="earning-amount">{getEarningAmount(event)}</span>
                    </a>
                  ))}
                </div>
              )}
            </Card>

            {isAdmin && (
              <Card title="合约状态" icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }>
              <div className="info-list">
                <div className="info-row">
                  <span className="info-label">合约状态</span>
                  <span className="info-value">
                    {stats?.paused ? (
                      <span className="status-tag status-tag-danger">已暂停</span>
                    ) : (
                      <span className="status-tag status-tag-success">运行中</span>
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">算力参数</span>
                  <span className="info-value">{stats ? Number(stats.computingPower) : '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">提现费率</span>
                  <span className="info-value">{stats ? formatBasisPoints(stats.withdrawFee) : '0.00%'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">合约USDT余额</span>
                  <span className="info-value">{stats ? formatNumber(stats.contractUSDTBalance) : '0.0000'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">合约XMR余额</span>
                  <span className="info-value">{stats ? formatNumber(stats.contractXMRBalance) : '0.0000'}</span>
                </div>
              </div>
            </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
