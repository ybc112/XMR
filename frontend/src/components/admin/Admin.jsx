import React, { useState, useEffect, useCallback } from 'react'
import Card from '../common/Card.jsx'
import Button from '../common/Button.jsx'
import Input from '../common/Input.jsx'
import Badge from '../common/Badge.jsx'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { useStaking } from '../../hooks/useStaking.js'
import { useContracts } from '../../hooks/useContracts.js'
import { useMultiSig } from '../../hooks/useMultiSig.js'
import { useToast } from '../common/Toast.jsx'
import { formatNumber, formatAddress, formatDailyRate } from '../../utils/format.js'
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../../config/contracts.js'
import { STAKING_DAPP_ABI } from '../../config/abis.js'
import { ethers } from 'ethers'

const MULTISIG_TEMPLATES = [
  { label: '紧急暂停', func: 'emergencyPause', params: '', noArgs: true },
  { label: '恢复运行', func: 'emergencyUnpause', params: '', noArgs: true },
  { label: '设置提现费率', func: 'setWithdrawFee', params: '500', hint: '万分比，500 = 5%' },
  { label: '设置XMR价格', func: 'setXMRPrice', params: '150', hint: 'USDT 计价' },
  { label: '每日结算', func: 'dailySettlement', params: '150', hint: '当日 XMR 价格' },
  { label: '添加管理员', func: 'addAdmin', params: '', hint: '参数填入新管理员地址 0x...' },
  { label: '移除管理员', func: 'removeAdmin', params: '', hint: '参数填入管理员地址 0x...' },
  { label: '处理XMR提现', func: 'processXMRWithdrawal', params: '', hint: '参数填入用户地址 0x...' }
]

export default function Admin() {
  const { account, isConnected, connectWallet, isAdmin, chainId, getReadOnlyProvider } = useWeb3()
  const {
    getUserInfo,
    getContractStats,
    setXMRPrice,
    dailySettlement,
    setWithdrawFee,
    setBlacklist,
    emergencyPause,
    emergencyUnpause,
    addAdmin,
    removeAdmin,
    processXMRWithdrawal,
    adjustUserUSDT,
    adjustUserXMR
  } = useStaking()
  const { getUSDTBalance, getXMRBalance } = useContracts()
  const {
    submitTransaction,
    confirmTransaction,
    revokeConfirmation,
    executeTransaction,
    getTransaction,
    getTransactionCount,
    getOwners,
    isOwner,
    required,
    isConfirmedBy
  } = useMultiSig()
  const { showSuccess, showError, showInfo } = useToast()

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const [xmrPrice, setXmrPrice] = useState('')
  const [withdrawFeeInput, setWithdrawFeeInput] = useState('')
  const [blacklistAddr, setBlacklistAddr] = useState('')
  const [blacklistStatus, setBlacklistStatus] = useState(true)
  const [adminAddr, setAdminAddr] = useState('')
  const [withdrawalUser, setWithdrawalUser] = useState('')
  const [withdrawalPending, setWithdrawalPending] = useState(0n)
  const [pendingXmrList, setPendingXmrList] = useState([])
  const [pendingXmrLoading, setPendingXmrLoading] = useState(false)

  const [contractBalances, setContractBalances] = useState({ usdt: 0n, xmr: 0n })
  const [requiredConfirm, setRequiredConfirm] = useState(0)
  const [txCount, setTxCount] = useState(0)
  const [multisigTxList, setMultisigTxList] = useState([])
  const [confirmedByMe, setConfirmedByMe] = useState([])
  const [owners, setOwners] = useState([])
  const [isCurrentOwner, setIsCurrentOwner] = useState(false)

  const [multisigDestination, setMultisigDestination] = useState('')
  const [multisigValue, setMultisigValue] = useState('')
  const [multisigData, setMultisigData] = useState('')
  const [multisigFuncName, setMultisigFuncName] = useState('')
  const [multisigFuncParams, setMultisigFuncParams] = useState('')

  // 多签列表分页
  const PAGE_SIZE = 10
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(multisigTxList.length / PAGE_SIZE))

  // 用户管理
  const [manageAddr, setManageAddr] = useState('')
  const [managedUser, setManagedUser] = useState(null)
  const [usdtDeltaInput, setUsdtDeltaInput] = useState('')
  const [xmrDeltaInput, setXmrDeltaInput] = useState('')

  const loadMultisigData = useCallback(async () => {
    try {
      const [req, count, ownerList, ownerStatus] = await Promise.all([
        required(),
        getTransactionCount(true, true),
        getOwners(),
        account ? isOwner(account) : false
      ])

      setRequiredConfirm(req)
      setTxCount(count)
      setOwners(ownerList)
      setIsCurrentOwner(ownerStatus)

      const txs = []
      const maxLoad = Math.min(count, 100)
      for (let i = 0; i < maxLoad; i++) {
        const tx = await getTransaction(i)
        if (tx) {
          txs.push({ id: i, ...tx })
        }
      }
      setMultisigTxList(txs)
      // 加载更多交易后，重置到第 1 页
      setPage(0)

      if (account && txs.length > 0) {
        const flags = await Promise.all(
          txs.map((tx) => isConfirmedBy(tx.id, account))
        )
        setConfirmedByMe(flags)
      } else {
        setConfirmedByMe([])
      }
    } catch (err) {
      console.error('加载多签数据失败:', err)
    }
  }, [required, getTransactionCount, getOwners, isOwner, account, getTransaction, isConfirmedBy])

  const loadPendingXmrList = useCallback(async () => {
    setPendingXmrLoading(true)
    try {
      const readOnly = getReadOnlyProvider()
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.StakingDApp,
        STAKING_DAPP_ABI,
        readOnly
      )
      const [requested, processed] = await Promise.all([
        contract.queryFilter(contract.filters.XMRWithdrawalRequested()),
        contract.queryFilter(contract.filters.XMRWithdrawalProcessed())
      ])

      const processedMaxBlock = new Map()
      for (const p of processed) {
        const u = (p.args?.user || '').toLowerCase()
        const prev = processedMaxBlock.get(u)
        if (prev === undefined || p.blockNumber > prev) processedMaxBlock.set(u, p.blockNumber)
      }

      const pending = requested
        .filter((r) => {
          const u = (r.args?.user || '').toLowerCase()
          if (!u) return false
          const maxBlock = processedMaxBlock.get(u)
          return maxBlock === undefined || r.blockNumber >= maxBlock
        })
        .sort((a, b) => b.blockNumber - a.blockNumber)

      const items = await Promise.all(
        pending.map(async (r) => {
          let xmrAddress = r.args?.xmrAddr || ''
          let onChainPending = 0n
          try {
            const info = await contract.getUserInfo(r.args.user)
            onChainPending = info ? info.xmrWithdrawalPending || 0n : 0n
            const latest = await contract.xmrAddress(r.args.user)
            if (latest) xmrAddress = latest
          } catch { /* 读取失败时保留事件内地址 */ }
          // 链上 pending 已被清零（如出局、复投等）则不是真实待处理
          if (onChainPending <= 0n) return null
          let time = null
          try {
            const block = await readOnly.getBlock(r.blockNumber)
            time = block ? block.timestamp : null
          } catch { /* 忽略时间读取失败 */ }
          return {
            user: r.args.user,
            amount: r.args.amount,
            onChainPending,
            xmrAddress,
            time,
            txHash: r.transactionHash
          }
        })
      )
      setPendingXmrList(items.filter(Boolean))
    } catch (err) {
      console.error('加载待处理XMR提现失败:', err)
      setPendingXmrList([])
    } finally {
      setPendingXmrLoading(false)
    }
  }, [getReadOnlyProvider])

  const loadData = useCallback(async () => {
    try {
      const contractStats = await getContractStats()
      setStats(contractStats)

      const [usdtBal, xmrBal] = await Promise.all([
        getUSDTBalance(CONTRACT_ADDRESSES.StakingDApp),
        getXMRBalance(CONTRACT_ADDRESSES.StakingDApp)
      ])

      setContractBalances({ usdt: usdtBal, xmr: xmrBal })
      await loadMultisigData()
      loadPendingXmrList()
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [getContractStats, getUSDTBalance, getXMRBalance, loadMultisigData, loadPendingXmrList])

  useEffect(() => {
    if (isConnected && account) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [isConnected, account, loadData])

  useEffect(() => {
    const fetchPending = async () => {
      if (!withdrawalUser) {
        setWithdrawalPending(0n)
        return
      }
      try {
        const info = await getUserInfo(withdrawalUser)
        setWithdrawalPending(info ? info.xmrWithdrawalPending || 0n : 0n)
      } catch (err) {
        setWithdrawalPending(0n)
      }
    }
    fetchPending()
  }, [withdrawalUser, getUserInfo])

  const isWrongNetwork = chainId && chainId !== NETWORK_CONFIG.chainId

  const handleAction = async (actionName, actionFn, ...args) => {
    if (isWrongNetwork) {
      showError('当前网络不是 BSC 测试网，请先切换网络')
      return
    }
    if (!isAdmin) {
      showError('当前钱包不是管理员，无法执行该操作（仅可查看）')
      return
    }
    setActionLoading(true)
    try {
      showInfo(`正在执行: ${actionName}`)
      await actionFn(...args)
      showSuccess(`${actionName}成功`)
      await loadData()
    } catch (err) {
      console.error(`${actionName}失败:`, err)
      showError(err.reason || err.message || `${actionName}失败`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleMultisigAction = async (actionName, actionFn, ...args) => {
    if (isWrongNetwork) {
      showError('当前网络不是 BSC 测试网，请先切换网络')
      return
    }
    if (!isCurrentOwner) {
      showError('当前钱包不是多签 owner，无法执行该操作')
      return
    }
    setActionLoading(true)
    try {
      showInfo(`正在执行: ${actionName}`)
      await actionFn(...args)
      showSuccess(`${actionName}成功`)
      await loadData()
    } catch (err) {
      console.error(`${actionName}失败:`, err)
      showError(err.reason || err.message || `${actionName}失败`)
    } finally {
      setActionLoading(false)
    }
  }

  const queryManagedUser = async () => {
    if (!manageAddr || !ethers.isAddress(manageAddr)) {
      showError('请输入有效的用户地址')
      return
    }
    setActionLoading(true)
    try {
      const info = await getUserInfo(manageAddr)
      if (!info || !info.isRegistered) {
        showError('该地址尚未注册')
        setManagedUser(null)
        return
      }
      setManagedUser(info)
      setUsdtDeltaInput('')
      setXmrDeltaInput('')
    } catch (err) {
      showError(err.reason || err.message || '查询失败')
    } finally {
      setActionLoading(false)
    }
  }

  const adjustUSDT = () => {
    const d = Number(usdtDeltaInput)
    if (!usdtDeltaInput || !isFinite(d) || d === 0) {
      showError('请输入非零的调整金额（正数增加、负数减少）')
      return
    }
    const wei = ethers.parseEther(String(Math.abs(d)))
    const delta = d > 0 ? wei : -wei
    handleAction('调整用户USDT余额', adjustUserUSDT, manageAddr, delta)
  }

  const adjustXMR = () => {
    const d = Number(xmrDeltaInput)
    if (!xmrDeltaInput || !isFinite(d) || d === 0) {
      showError('请输入非零的调整金额（正数增加、负数减少）')
      return
    }
    const wei = ethers.parseEther(String(Math.abs(d)))
    const delta = d > 0 ? wei : -wei
    handleAction('调整用户XMR余额', adjustUserXMR, manageAddr, delta)
  }

  const handleSubmitMultisig = () => {
    if (isWrongNetwork) {
      showError('当前网络不是 BSC 测试网，请先切换网络')
      return
    }
    if (!isCurrentOwner) {
      showError('当前钱包不是多签 owner，无法提交多签交易')
      return
    }
    const value = ethers.parseEther(multisigValue || '0')
    const data = multisigData.trim() || '0x'

    const dup = multisigTxList.find(
      (tx) => !tx.executed &&
        tx.destination.toLowerCase() === multisigDestination.trim().toLowerCase() &&
        (tx.data || '').toLowerCase() === data.toLowerCase()
    )
    if (dup) {
      showError(`已存在相同的待执行交易 #${dup.id}，如确需重复提交请先执行或确认该交易`)
      return
    }

    handleMultisigAction('提交多签交易', submitTransaction, multisigDestination, value, data)
  }

  const decodeTxData = (tx) => {
    if (!tx.data || tx.data === '0x') {
      return tx.value > 0n ? `转账 ${formatNumber(tx.value)} BNB` : '纯转账'
    }
    try {
      const iface = new ethers.Interface(STAKING_DAPP_ABI)
      const decoded = iface.parseTransaction({ data: tx.data })
      const args = decoded.args.map((arg) => {
        const s = String(arg)
        return s.startsWith('0x') && s.length > 12 ? `${s.slice(0, 8)}...${s.slice(-4)}` : s
      })
      return `${decoded.fragment.name}(${args.join(', ')})`
    } catch {
      return `未知调用 ${tx.data.slice(0, 14)}...`
    }
  }

  const applyMultisigTemplate = (tpl) => {
    setMultisigDestination(CONTRACT_ADDRESSES.StakingDApp)
    setMultisigValue('0')
    setMultisigFuncName(tpl.func)
    setMultisigFuncParams(tpl.params)
    setMultisigData('')
    if (tpl.noArgs) {
      try {
        const iface = new ethers.Interface(STAKING_DAPP_ABI)
        setMultisigData(iface.encodeFunctionData(tpl.func, []))
        showSuccess(`已选择「${tpl.label}」并生成 calldata，可直接提交交易`)
      } catch {
        showInfo(`已选择「${tpl.label}」，请点击"生成 calldata"`)
      }
    } else {
      showInfo(
        tpl.hint
          ? `已选择「${tpl.label}」：${tpl.hint}，确认参数后点击"生成 calldata"`
          : `已选择「${tpl.label}」，请填写参数后生成 calldata`
      )
    }
  }

  const copyText = async (text, label = '地址') => {
    try {
      await navigator.clipboard.writeText(text)
      showSuccess(`已复制${label}`)
    } catch {
      showError('复制失败，请手动复制')
    }
  }

  const handleGenerateCalldata = () => {
    try {
      if (!multisigFuncName) {
        showError('请输入函数名')
        return
      }
      const iface = new ethers.Interface(STAKING_DAPP_ABI)
      const params = multisigFuncParams
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== '')
        .map((p) => {
          if (ethers.isAddress(p)) return p
          if (!isNaN(p) && p.includes('.')) return ethers.parseEther(p)
          if (!isNaN(p)) return BigInt(p)
          return p
        })
      const data = iface.encodeFunctionData(multisigFuncName, params)
      setMultisigData(data)
      showSuccess('已生成 calldata')
    } catch (err) {
      console.error('生成 calldata 失败:', err)
      showError('生成 calldata 失败，请检查函数名和参数')
    }
  }

  if (!isConnected) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">管理</h1>
        </div>
        <Card title="连接钱包">
          <div className="connect-prompt">
            <p>请连接管理员钱包</p>
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

  const statusIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8V13M12 16H12.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )

  return (
    <div className="page-container">
      {isWrongNetwork ? (
        <div className="admin-readonly-banner" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#ef4444' }}>
            <path d="M12 9V14M12 17H12.01M10.3 3.86L1.82 18A2 2 0 003.54 21H20.46A2 2 0 0022.18 18L13.7 3.86A2 2 0 0010.3 3.86Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ color: '#ef4444' }}>当前网络不是 BSC 测试网（chainId: {chainId || '未知'}），请在钱包中切换到 BSC 测试网后刷新页面</span>
        </div>
      ) : !isAdmin && !isCurrentOwner ? (
        <div className="admin-readonly-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 9V14M12 17H12.01M10.3 3.86L1.82 18A2 2 0 003.54 21H20.46A2 2 0 0022.18 18L13.7 3.86A2 2 0 0010.3 3.86Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>当前钱包不是管理员：仅可查看数据，执行操作需使用管理员钱包（多签 owner 或已添加为 admin 的钱包）</span>
        </div>
      ) : null}
      <div className="page-header">
        <div>
          <h1 className="page-title">管理后台</h1>
          <p className="page-subtitle">合约状态监控与参数配置</p>
        </div>
        <div className="admin-header-actions">
          <a className="panel-link" href="/panel" target="_blank" rel="noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 13V19C18 19.55 17.55 20 17 20H5C4.45 20 4 19.55 4 19V7C4 6.45 4.45 6 5 6H11M14 4H20V10M19.5 4.5L10 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            运营后台
          </a>
          <Badge variant={stats?.paused ? 'danger' : 'green'}>
            {stats?.paused ? '已暂停' : '运行中'}
          </Badge>
        </div>
      </div>

      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon">{statusIcon}</div>
          <div className="stat-info">
            <div className="stat-label">合约状态</div>
            <div className="stat-value">{stats?.paused ? '已暂停' : '运行中'}</div>
            <div className="stat-change stat-change-neutral">系统健康</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2V22M17 5H9.5A3.5 3.5 0 009.5 12H14.5A3.5 3.5 0 0114.5 19H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-label">XMR 价格</div>
            <div className="stat-value">{stats ? formatNumber(stats.xmrPrice) : '-'} USDT</div>
            <div className="stat-change stat-change-neutral">最新报价</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 12L9 6L13 10L21 2M21 2H15M21 2V8M21 12V20C21 20.55 20.55 21 20 21H4C3.45 21 3 20.55 3 20V4C3 3.45 3.45 3 4 3H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-label">日化率</div>
            <div className="stat-value">{stats ? formatDailyRate(stats.dailyRate, stats.computingPower) : '-'}</div>
            <div className="stat-change stat-change-neutral">每日收益基准</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7ZM23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-label">总用户数</div>
            <div className="stat-value">{stats ? Number(stats.totalUsers) : '-'}</div>
            <div className="stat-change stat-change-up">活跃参与</div>
          </div>
        </div>
      </div>

      <Card title="多签钱包状态" className="mb-4">
        <div className="admin-status-grid">
          <div className="admin-status-item">
            <span className="status-label">当前身份</span>
            <span className="status-value">
              {isCurrentOwner ? (
                <span className="text-gold">多签 owner</span>
              ) : (
                <span className="text-muted">非 owner</span>
              )}
            </span>
          </div>
          <div className="admin-status-item">
            <span className="status-label">所需确认数</span>
            <span className="status-value">{requiredConfirm}</span>
          </div>
          <div className="admin-status-item">
            <span className="status-label">Owner 数量</span>
            <span className="status-value">{owners.length}</span>
          </div>
          <div className="admin-status-item">
            <span className="status-label">交易总数</span>
            <span className="status-value">{txCount}</span>
          </div>
        </div>
      </Card>

      <Card title="紧急操作" className="mb-4">
        <div className="admin-actions-row">
          <Button
            variant="danger"
            onClick={() => handleAction('紧急暂停', emergencyPause)}
            loading={actionLoading}
            disabled={stats?.paused}
          >
            紧急暂停
          </Button>
          <Button
            variant="success"
            onClick={() => handleAction('恢复运行', emergencyUnpause)}
            loading={actionLoading}
            disabled={!stats?.paused}
          >
            恢复运行
          </Button>
        </div>
      </Card>

      <div className="admin-grid">
        <Card title="合约余额监控">
          <div className="info-list">
            <div className="info-row">
              <span className="info-label">USDT 余额</span>
              <span className="info-value">{formatNumber(contractBalances.usdt)} USDT</span>
            </div>
            <div className="info-row">
              <span className="info-label">XMR 余额</span>
              <span className="info-value">{formatNumber(contractBalances.xmr)} XMR</span>
            </div>
          </div>
        </Card>

        <Card title="多签操作" subtitle={`需要 ${requiredConfirm} 个确认`}>
          <div className="multisig-templates">
            {MULTISIG_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                className="multisig-template-btn"
                onClick={() => applyMultisigTemplate(tpl)}
                title={tpl.hint || tpl.label}
              >
                {tpl.label}
              </button>
            ))}
          </div>
          <div className="admin-form">
            <Input
              label="目标合约地址"
              value={multisigDestination}
              onChange={(e) => setMultisigDestination(e.target.value)}
              placeholder="0x..."
            />
            <Input
              label="Value (BNB)"
              value={multisigValue}
              onChange={(e) => setMultisigValue(e.target.value)}
              placeholder="0"
              type="number"
            />
            <Input
              label="Data (hex)"
              value={multisigData}
              onChange={(e) => setMultisigData(e.target.value)}
              placeholder="0x..."
            />
            <div className="calldata-helper">
              <Input
                label="函数名"
                value={multisigFuncName}
                onChange={(e) => setMultisigFuncName(e.target.value)}
                placeholder="setWithdrawFee"
              />
              <Input
                label="参数 (逗号分隔)"
                value={multisigFuncParams}
                onChange={(e) => setMultisigFuncParams(e.target.value)}
                placeholder="500"
              />
              <Button
                variant="outline"
                size="small"
                onClick={handleGenerateCalldata}
              >
                生成 calldata
              </Button>
            </div>
            <Button
              variant="primary"
              fullWidth
              onClick={handleSubmitMultisig}
              loading={actionLoading}
            >
              提交交易
            </Button>
          </div>
        </Card>

        <Card title="设置 XMR 价格">
          <div className="admin-form">
            <Input
              label="XMR 价格 (USDT)"
              value={xmrPrice}
              onChange={(e) => setXmrPrice(e.target.value)}
              placeholder="例如: 150.00"
              type="number"
            />
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleAction('设置XMR价格', setXMRPrice, xmrPrice)}
              loading={actionLoading}
            >
              设置价格
            </Button>
          </div>
        </Card>

        <Card title="每日结算">
          <div className="admin-form">
            <Input
              label="结算 XMR 价格"
              value={xmrPrice}
              onChange={(e) => setXmrPrice(e.target.value)}
              placeholder="输入当日XMR价格"
              type="number"
            />
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleAction('每日结算', dailySettlement, xmrPrice)}
              loading={actionLoading}
            >
              执行结算
            </Button>
          </div>
        </Card>

        <Card title="设置提现费率">
          <div className="admin-form">
            <Input
              label="提现费率 (%)"
              value={withdrawFeeInput}
              onChange={(e) => setWithdrawFeeInput(e.target.value)}
              placeholder="例如: 5"
              type="number"
            />
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleAction('设置提现费率', setWithdrawFee, withdrawFeeInput)}
              loading={actionLoading}
            >
              设置费率
            </Button>
          </div>
        </Card>

        <Card
          title="处理 XMR 提现"
          subtitle={pendingXmrList.length > 0 ? `${pendingXmrList.length} 笔待处理` : undefined}
          action={
            <Button
              variant="outline"
              size="small"
              onClick={loadPendingXmrList}
              loading={pendingXmrLoading}
            >
              刷新
            </Button>
          }
        >
          {pendingXmrList.length > 0 ? (
            <div className="pending-xmr-list">
              {pendingXmrList.map((item, idx) => (
                <div className="pending-xmr-item" key={`${item.txHash || ''}-${idx}`}>
                  <div className="pending-xmr-info">
                    <span
                      className="pending-xmr-addr"
                      onClick={() => copyText(item.user, '用户地址')}
                      title={item.user}
                    >
                      {formatAddress(item.user)}
                    </span>
                    <span className="pending-xmr-amount">{formatNumber(item.amount)} XMR</span>
                    {item.xmrAddress && (
                      <span
                        className="pending-xmr-xmraddr"
                        onClick={() => copyText(item.xmrAddress, 'XMR收款地址')}
                        title={item.xmrAddress}
                      >
                        收款: {item.xmrAddress.length > 24
                          ? `${item.xmrAddress.slice(0, 16)}...${item.xmrAddress.slice(-8)}`
                          : item.xmrAddress}
                      </span>
                    )}
                    {item.time && (
                      <span className="pending-xmr-time">
                        {new Date(item.time * 1000).toLocaleString('zh-CN', { hour12: false })}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => handleAction('处理XMR提现', processXMRWithdrawal, item.user)}
                    loading={actionLoading}
                  >
                    一键处理
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="pending-xmr-empty">
              {pendingXmrLoading ? '正在从链上加载待处理提现...' : '暂无待处理的 XMR 提现'}
            </div>
          )}
          <div className="admin-form pending-xmr-manual">
            <Input
              label="手动处理 - 用户地址"
              value={withdrawalUser}
              onChange={(e) => setWithdrawalUser(e.target.value)}
              placeholder="0x..."
            />
            {withdrawalUser && (
              <div className="info-row mt-3">
                <span className="info-label">待处理 XMR 提现</span>
                <span className="info-value">{formatNumber(withdrawalPending)} XMR</span>
              </div>
            )}
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleAction('处理XMR提现', processXMRWithdrawal, withdrawalUser)}
              loading={actionLoading}
            >
              处理提现
            </Button>
          </div>
        </Card>

        <Card title="管理员管理">
          <div className="admin-form">
            <Input
              label="管理员地址"
              value={adminAddr}
              onChange={(e) => setAdminAddr(e.target.value)}
              placeholder="0x..."
            />
            <div className="admin-actions-row">
              <Button
                variant="primary"
                onClick={() => handleAction('添加管理员', addAdmin, adminAddr)}
                loading={actionLoading}
              >
                添加
              </Button>
              <Button
                variant="danger"
                onClick={() => handleAction('移除管理员', removeAdmin, adminAddr)}
                loading={actionLoading}
              >
                移除
              </Button>
            </div>
          </div>
        </Card>

        <Card title="黑名单管理">
          <div className="admin-form">
            <Input
              label="用户地址"
              value={blacklistAddr}
              onChange={(e) => setBlacklistAddr(e.target.value)}
              placeholder="0x..."
            />
            <div className="toggle-row">
              <label className="toggle-label">
                <input
                  type="radio"
                  checked={blacklistStatus}
                  onChange={() => setBlacklistStatus(true)}
                />
                加入黑名单
              </label>
              <label className="toggle-label">
                <input
                  type="radio"
                  checked={!blacklistStatus}
                  onChange={() => setBlacklistStatus(false)}
                />
                移出黑名单
              </label>
            </div>
            <Button
              variant={blacklistStatus ? 'danger' : 'success'}
              fullWidth
              onClick={() => handleAction('黑名单管理', setBlacklist, blacklistAddr, blacklistStatus)}
              loading={actionLoading}
            >
              {blacklistStatus ? '加入黑名单' : '移出黑名单'}
            </Button>
          </div>
        </Card>

        <Card title="用户管理" className="admin-user-management">
          <div className="admin-form">
            <Input
              label="用户地址"
              value={manageAddr}
              onChange={(e) => setManageAddr(e.target.value)}
              placeholder="0x..."
            />
            <Button
              variant="primary"
              fullWidth
              onClick={queryManagedUser}
              loading={actionLoading}
            >
              查询用户
            </Button>
          </div>

          {managedUser && (
            <div className="managed-user-panel">
              <div className="managed-user-header">
                <div>
                  <span className="managed-user-label">会员ID</span>
                  <span className="managed-user-value">{managedUser.memberId || '-'}</span>
                </div>
                <div>
                  <span className="managed-user-label">等级</span>
                  <Badge variant={managedUser.level ? 'success' : 'default'}>
                    {managedUser.level ? `M${managedUser.level}` : '-'}
                  </Badge>
                </div>
                <div>
                  <span className="managed-user-label">状态</span>
                  <Badge variant={managedUser.isBlacklisted ? 'danger' : managedUser.exited ? 'warning' : 'success'}>
                    {managedUser.isBlacklisted ? '黑名单' : managedUser.exited ? '已出局' : '正常'}
                  </Badge>
                </div>
              </div>

              <div className="managed-user-balances">
                <div className="managed-user-balance-item">
                  <span className="managed-user-label">待提 USDT</span>
                  <span className="managed-user-value">{formatNumber(managedUser.pendingUSDT || 0n)}</span>
                </div>
                <div className="managed-user-balance-item">
                  <span className="managed-user-label">待提 XMR</span>
                  <span className="managed-user-value">{formatNumber(managedUser.pendingXMR || 0n)}</span>
                </div>
                <div className="managed-user-balance-item">
                  <span className="managed-user-label">个人业绩</span>
                  <span className="managed-user-value">{formatNumber(managedUser.personalAmount || 0n)}</span>
                </div>
                <div className="managed-user-balance-item">
                  <span className="managed-user-label">算力</span>
                  <span className="managed-user-value">{formatNumber(managedUser.personalAmount || 0n)}</span>
                </div>
              </div>

              <div className="managed-user-actions">
                <div className="managed-user-action-row">
                  <Input
                    label="USDT 调整"
                    type="number"
                    value={usdtDeltaInput}
                    onChange={(e) => setUsdtDeltaInput(e.target.value)}
                    placeholder="正数增加 / 负数减少"
                  />
                  <Button
                    variant="primary"
                    onClick={adjustUSDT}
                    loading={actionLoading}
                  >
                    调整 USDT
                  </Button>
                </div>

                <div className="managed-user-action-row">
                  <Input
                    label="XMR 调整"
                    type="number"
                    value={xmrDeltaInput}
                    onChange={(e) => setXmrDeltaInput(e.target.value)}
                    placeholder="正数增加 / 负数减少"
                  />
                  <Button
                    variant="primary"
                    onClick={adjustXMR}
                    loading={actionLoading}
                  >
                    调整 XMR
                  </Button>
                </div>

                <Button
                  variant={managedUser.isBlacklisted ? 'success' : 'danger'}
                  fullWidth
                  onClick={() => handleAction('黑名单管理', setBlacklist, manageAddr, !managedUser.isBlacklisted)}
                  loading={actionLoading}
                >
                  {managedUser.isBlacklisted ? '移出黑名单' : '加入黑名单'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="多签交易列表"
        subtitle={`共 ${txCount} 笔交易 · 需要 ${requiredConfirm} 个确认`}
        className="mt-4"
        action={
          <Button
            variant="outline"
            size="small"
            onClick={() => loadMultisigData()}
            loading={loading}
          >
            刷新列表
          </Button>
        }
      >
        {multisigTxList.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p>暂无多签交易</p>
          </div>
        ) : (
          <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>操作内容</th>
                  <th>目标地址</th>
                  <th>值</th>
                  <th>状态</th>
                  <th>确认数</th>
                  <th>我已签名</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {multisigTxList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((tx, idx) => {
                  const globalIdx = page * PAGE_SIZE + idx
                  const myConfirmed = confirmedByMe[globalIdx] === true
                  const canExecute = !tx.executed && tx.confirmCount >= requiredConfirm
                  return (
                    <tr key={tx.id} className={canExecute ? 'row-highlight' : ''}>
                      <td className="text-mono">#{tx.id}</td>
                      <td className="text-mono multisig-decoded">{decodeTxData(tx)}</td>
                      <td className="text-mono">{formatAddress(tx.destination)}</td>
                      <td>{formatNumber(tx.value)}</td>
                      <td>
                        {tx.executed ? (
                          <span className="status-tag status-tag-success">已执行</span>
                        ) : canExecute ? (
                          <span className="status-tag status-tag-info">可执行</span>
                        ) : (
                          <span className="status-tag status-tag-warning">待执行</span>
                        )}
                      </td>
                      <td>{tx.confirmCount} / {requiredConfirm}</td>
                      <td>{myConfirmed ? '✅' : '❌'}</td>
                      <td>
                        {tx.executed ? (
                          <span className="text-muted">-</span>
                        ) : (
                          <div className="admin-actions-row">
                            <Button
                              variant="primary"
                              size="small"
                              onClick={() => handleMultisigAction('确认交易', confirmTransaction, tx.id)}
                              loading={actionLoading}
                              disabled={myConfirmed}
                              title={myConfirmed ? '您已签名' : ''}
                            >
                              {myConfirmed ? '已签' : '确认'}
                            </Button>
                            <Button
                              variant="outline"
                              size="small"
                              onClick={() => handleMultisigAction('撤销确认', revokeConfirmation, tx.id)}
                              loading={actionLoading}
                              disabled={!myConfirmed}
                            >
                              撤销
                            </Button>
                            <Button
                              variant="success"
                              size="small"
                              onClick={() => handleMultisigAction('执行交易', executeTransaction, tx.id)}
                              loading={actionLoading}
                              disabled={!canExecute || !myConfirmed}
                            >
                              执行
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="multisig-pagination">
            <Button
              variant="outline"
              size="small"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              上一页
            </Button>
            <span className="pagination-info">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, multisigTxList.length)} / {multisigTxList.length}
            </span>
            <Button
              variant="outline"
              size="small"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              下一页
            </Button>
          </div>
          </>
        )}
      </Card>
    </div>
  )
}
