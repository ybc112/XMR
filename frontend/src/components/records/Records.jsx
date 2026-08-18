import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Contract, JsonRpcProvider, formatEther } from 'ethers'
import Card from '../common/Card.jsx'
import Button from '../common/Button.jsx'
import Badge from '../common/Badge.jsx'
import Tabs from '../common/Tabs.jsx'
import Skeleton from '../common/Skeleton.jsx'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { useToast } from '../common/Toast.jsx'
import { formatAddress, formatDateTime, shortHash } from '../../utils/format.js'
import { API_BASE_URL, CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../../config/contracts.js'
import { getTxHashUrl } from '../../utils/format.js'

const PAGE_SIZE = 20

// 事件类型 -> 展示信息（label / 方向 / 金额字段 / 币种 / 备注）
// noteXmr: true 表示主金额为 USDT 价值，附加显示按 XMR 价格换算的 XMR 数量
const RECORD_TYPE_MAP = {
  Invested: { label: '投资', direction: 'out', symbol: 'USDT', amountKey: 'amount' },
  StaticRewardClaimed: { label: '静态收益', direction: 'in', symbol: 'XMR', amountKey: 'xmrAmount', noteKey: 'usdtValue', noteSymbol: 'USDT' },
  GenerationReward: { label: '推荐奖', direction: 'in', symbol: 'USDT', amountKey: 'amount', noteXmr: true },
  TeamReward: { label: '团队奖', direction: 'in', symbol: 'USDT', amountKey: 'amount', noteXmr: true },
  FlashExchanged: { label: '闪兑', direction: 'swap', symbol: 'USDT', amountKey: 'usdtAmount', noteKey: 'xmrAmount', noteSymbol: 'XMR' },
  USDTWithdrawn: { label: 'USDT 提现', direction: 'out', symbol: 'USDT', amountKey: 'amount', feeKey: 'fee', feeSymbol: 'USDT' },
  XMRWithdrawalRequested: { label: 'XMR 提现申请', direction: 'out', symbol: 'XMR', amountKey: 'amount', feeKey: 'fee', feeSymbol: 'XMR' },
  XMRWithdrawalProcessed: { label: 'XMR 提现到账', direction: 'out', symbol: 'XMR', amountKey: 'amount' }
}

function formatTokenAmount(value, decimals = 4) {
  if (value === undefined || value === null) return '0'
  try {
    const s = value.toString().trim()
    if (!s || s === '0') return '0'
    const ether = formatEther(s)
    const num = Number(ether)
    // 大金额保留 2 位小数，避免屏幕溢出；常规金额保留 decimals 位
    const fractionDigits = num >= 10000 ? 2 : decimals
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    })
  } catch {
    return value.toString()
  }
}

// 直接格式化十进制数量（如换算后的 XMR 数，非 wei）
function formatPlainAmount(num, decimals = 6) {
  if (!isFinite(num) || num <= 0) return '0'
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

function RecordRow({ record, xmrPrice }) {
  const meta = RECORD_TYPE_MAP[record.eventType] || { label: record.eventType, direction: 'swap', symbol: '', amountKey: null }
  const amount = meta.amountKey ? record.args?.[meta.amountKey] : null
  const fee = meta.feeKey ? record.args?.[meta.feeKey] : null
  const note = meta.noteKey ? record.args?.[meta.noteKey] : null

  // USDT 价值按当前 XMR 价格换算的 XMR 数量（完整显示：+5 USDT ≈ 0.0121 XMR）
  let noteXmrAmount = null
  if (meta.noteXmr && amount !== null && amount !== undefined && xmrPrice > 0) {
    try {
      const usdt = Number(formatEther(amount))
      noteXmrAmount = usdt / xmrPrice
    } catch {
      noteXmrAmount = null
    }
  }

  const dirText = meta.direction === 'in' ? '+' : meta.direction === 'out' ? '-' : ''
  const dirClass = meta.direction === 'in' ? 'record-amount-in' : meta.direction === 'out' ? 'record-amount-out' : 'record-amount-swap'

  return (
    <a
      href={getTxHashUrl(record.txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className="record-item"
    >
      <div className={`record-icon record-icon-${meta.direction}`}>
        {meta.direction === 'in' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5M5 12L12 19L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : meta.direction === 'out' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 5V19M19 12L12 5L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="record-info">
        <div className="record-title-line">
          <span className="record-title">{meta.label}</span>
          {record.timestamp && (
            <span className="record-time">{formatDateTime(record.timestamp)}</span>
          )}
        </div>
        <span className="record-meta" title={record.txHash}>
          {shortHash(record.txHash, 10)} · 区块 {record.blockNumber}
        </span>
      </div>
      <div className="record-right">
        {amount !== null && amount !== undefined && (
          <span className={`record-amount ${dirClass}`} title={`${formatTokenAmount(amount, 6)} ${meta.symbol}`}>
            {dirText}{formatTokenAmount(amount)} {meta.symbol}
          </span>
        )}
        {fee !== null && fee !== undefined && Number(fee) > 0 ? (
          <span className="record-fee">手续费 {formatTokenAmount(fee)} {meta.feeSymbol}</span>
        ) : null}
        {noteXmrAmount !== null && noteXmrAmount > 0 ? (
          <span className="record-fee">≈ {formatPlainAmount(noteXmrAmount)} XMR</span>
        ) : null}
        {note !== null && note !== undefined && Number(note) > 0 ? (
          <span className="record-fee">≈ {formatTokenAmount(note)} {meta.noteSymbol}</span>
        ) : null}
      </div>
    </a>
  )
}

export default function Records() {
  const navigate = useNavigate()
  const { account, isConnected, connectWallet } = useWeb3()
  const { showError } = useToast()

  const [direction, setDirection] = useState('all')
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [backendDown, setBackendDown] = useState(false)
  const [xmrPrice, setXmrPrice] = useState(0)
  const abortRef = useRef(null)

  // 读取链上 XMR 价格（用于团队奖/推荐奖的 XMR 等值换算显示）
  useEffect(() => {
    let cancelled = false
    const loadPrice = async () => {
      try {
        const provider = new JsonRpcProvider(NETWORK_CONFIG.rpcUrls[0])
        const contract = new Contract(
          CONTRACT_ADDRESSES.StakingDApp,
          ['function xmrPrice() view returns (uint256)'],
          provider
        )
        const price = Number(formatEther(await contract.xmrPrice()))
        if (!cancelled && price > 0) setXmrPrice(price)
      } catch {
        // 价格读取失败时仅不显示换算备注，不影响流水
      }
    }
    loadPrice()
    return () => { cancelled = true }
  }, [])

  const fetchPage = useCallback(async (targetPage, dir, append) => {
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    append ? setLoadingMore(true) : setLoading(true)
    setBackendDown(false)
    try {
      const url = `${API_BASE_URL}/api/user/${account}/events?page=${targetPage}&limit=${PAGE_SIZE}&direction=${dir}&withTimestamp=1`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const data = json.data || json
      const items = (data.items || []).filter((e) => RECORD_TYPE_MAP[e.eventType])
      setRecords((prev) => (append ? [...prev, ...items] : items))
      setTotal(data.total || 0)
      setPage(targetPage)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('加载资金明细失败:', err)
      setBackendDown(true)
      if (!append) {
        setRecords([])
        setTotal(0)
      }
      showError('资金明细服务暂不可用，请稍后重试')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [account, showError])

  useEffect(() => {
    if (isConnected && account) {
      fetchPage(1, direction, false)
    }
    return () => abortRef.current?.abort()
  }, [isConnected, account, direction, fetchPage])

  if (!isConnected) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">资金明细</h1>
        </div>
        <Card title="连接钱包" featured>
          <div className="connect-prompt">
            <p>请先连接钱包查看资金明细</p>
            <Button variant="primary" onClick={connectWallet}>连接钱包</Button>
          </div>
        </Card>
      </div>
    )
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)
  const hasMore = page < totalPages

  const tabs = [
    { label: '全部', content: null },
    { label: '收入', content: null },
    { label: '支出', content: null }
  ]
  const tabActive = direction === 'all' ? 0 : direction === 'in' ? 1 : 2

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">资金明细</h1>
          <p className="page-subtitle">完整的资金进出账流水 · 共 {total} 条</p>
        </div>
        <Button variant="outline" size="small" onClick={() => navigate('/assets')}>
          返回资产
        </Button>
      </div>

      <Card
        title="流水记录"
        subtitle={`第 ${page}/${totalPages} 页`}
        featured
        action={
          <Button variant="outline" size="small" onClick={() => fetchPage(1, direction, false)} loading={loading}>
            刷新
          </Button>
        }
      >
        <div className="records-filter">
          <Tabs
            tabs={tabs}
            active={tabActive}
            onChange={(idx) => setDirection(idx === 0 ? 'all' : idx === 1 ? 'in' : 'out')}
          />
        </div>

        {loading ? (
          <div className="records-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="record-item">
                <Skeleton width="36px" height="36px" circle />
                <div className="record-info">
                  <Skeleton width="90px" height="14px" />
                  <Skeleton width="160px" height="12px" />
                </div>
                <Skeleton width="110px" height="14px" />
              </div>
            ))}
          </div>
        ) : backendDown ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#64748B" strokeWidth="1.5" />
              <path d="M12 8V12M12 16H12.01" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p>明细服务暂不可用</p>
            <p className="text-sub">数据服务在同步链上记录，请稍后刷新重试</p>
          </div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M3 10H21M5 6H19C20.1046 6 21 6.89543 21 8V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V8C3 6.89543 3.89543 6 5 6Z" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p>暂无资金记录</p>
          </div>
        ) : (
          <>
            <div className="records-list">
              {records.map((record) => (
                <RecordRow key={`${record.txHash}-${record.logIndex}`} record={record} xmrPrice={xmrPrice} />
              ))}
            </div>
            {hasMore && (
              <div className="records-more">
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => fetchPage(page + 1, direction, true)}
                  loading={loadingMore}
                >
                  加载更多（剩余 {total - page * PAGE_SIZE} 条）
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
