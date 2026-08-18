import React, { useState, useEffect, useCallback } from 'react'
import Card from '../common/Card.jsx'
import Button from '../common/Button.jsx'
import ProgressBar from '../common/ProgressBar.jsx'
import Badge from '../common/Badge.jsx'
import StatChange from '../common/StatChange.jsx'
import Tabs from '../common/Tabs.jsx'
import { useWeb3 } from '../../contexts/Web3Context.jsx'
import { useStaking } from '../../hooks/useStaking.js'
import { useToast } from '../common/Toast.jsx'
import { formatNumber, formatAddress, formatEther, getLevelName, safeNumber } from '../../utils/format.js'
import { LEVEL_INFO, GENERATION_RATES } from '../../utils/constants.js'
import { BSC_EXPLORER } from '../../config/contracts.js'

const MAX_NETWORK_DEPTH = 4
export default function Team() {
  const { account, isConnected, connectWallet } = useWeb3()
  const {
    getUserInfo,
    getDirectReferrals,
    getDirectReferralCount,
    getSubAreaVolume
  } = useStaking()
  const { showError } = useToast()

  const [userInfo, setUserInfo] = useState(null)
  const [referrals, setReferrals] = useState([])
  const [referralStats, setReferralStats] = useState([])
  const [subAreaVolume, setSubAreaVolume] = useState(0n)
  const [loading, setLoading] = useState(true)

  const [networkTree, setNetworkTree] = useState(null)
  const [networkLoading, setNetworkLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!account) return
    try {
      const info = await getUserInfo(account)
      setUserInfo(info)

      const subs = await getDirectReferrals(account)
      setReferrals(subs)

      const stats = await Promise.all(
        subs.map(async (addr) => {
          const [count, refInfo] = await Promise.all([
            getDirectReferralCount(addr),
            getUserInfo(addr)
          ])
          return {
            address: addr,
            count: Number(count),
            personalAmount: refInfo ? refInfo.personalAmount : 0n,
            level: refInfo ? Number(refInfo.level) : 0
          }
        })
      )
      setReferralStats(stats)

      const subVol = await getSubAreaVolume(account)
      setSubAreaVolume(subVol)
    } catch (err) {
      console.error('加载团队数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [account, getUserInfo, getDirectReferrals, getDirectReferralCount, getSubAreaVolume])

  const loadNetwork = useCallback(async () => {
    if (!account) return
    setNetworkLoading(true)
    try {
      // BFS 按层并行加载：同层节点的 RPC 用 Promise.all 并发，避免逐节点串行
      const nodeMap = new Map()

      const fetchNodes = async (addresses, depth) => {
        const results = await Promise.all(
          addresses.map(async (addr) => {
            const [info, directCount] = await Promise.all([
              getUserInfo(addr),
              getDirectReferralCount(addr)
            ])
            return {
              address: addr,
              depth,
              memberId: info?.memberId ? Number(info.memberId) : 0,
              personalAmount: info?.personalAmount || 0n,
              level: info?.level !== undefined ? Number(info.level) : 0,
              referralCount: Number(directCount),
              children: []
            }
          })
        )
        results.forEach((n) => nodeMap.set(n.address.toLowerCase(), n))
        return results
      }

      const [rootNode] = await fetchNodes([account], 0)

      let currentLayer = [rootNode]
      for (let depth = 0; depth < MAX_NETWORK_DEPTH && currentLayer.length > 0; depth++) {
        // 取所有当前层节点的直推列表（并行）
        const referralLists = await Promise.all(
          currentLayer.map((n) => getDirectReferrals(n.address))
        )
        // 收集下一层需要加载信息的地址（去重）
        const nextAddrs = []
        referralLists.forEach((refs) => {
          refs.forEach((r) => {
            if (!nodeMap.has(r.toLowerCase())) nextAddrs.push(r)
          })
        })
        if (nextAddrs.length === 0) break
        const nextNodes = await fetchNodes(nextAddrs, depth + 1)
        // 建立父子关系
        currentLayer.forEach((n, i) => {
          referralLists[i].forEach((r) => {
            const child = nodeMap.get(r.toLowerCase())
            if (child) n.children.push(child)
          })
        })
        currentLayer = nextNodes
      }

      setNetworkTree(rootNode)
    } catch (err) {
      console.error('加载推荐网络失败:', err)
      showError('加载推荐网络失败')
    } finally {
      setNetworkLoading(false)
    }
  }, [account, getUserInfo, getDirectReferrals, getDirectReferralCount, showError])

  useEffect(() => {
    if (isConnected && account) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [isConnected, account, loadData])

  useEffect(() => {
    if (isConnected && account) {
      loadNetwork()
    }
  }, [isConnected, account, loadNetwork])

  if (!isConnected) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">团队</h1>
        </div>
        <Card title="连接钱包" featured>
          <div className="connect-prompt">
            <p>请先连接钱包查看团队信息</p>
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

  const teamVolume = userInfo ? userInfo.teamTotalVolume : 0n
  const maxAreaVolume = userInfo ? userInfo.maxAreaVolume : 0n
  const currentLevel = userInfo ? Number(userInfo.level) : 0
  const currentLevelInfo = LEVEL_INFO[currentLevel] || LEVEL_INFO[0]
  const nextLevelInfo = LEVEL_INFO[currentLevel + 1]

  // 升级考核的是个人业绩 + 小区业绩（与合约 _checkAndSetLevel 一致），不是团队总业绩
  const personalAmountNum = userInfo ? safeNumber(formatEther(userInfo.personalAmount)) : 0
  const nextPersonalReq = nextLevelInfo ? nextLevelInfo.personalReq : currentLevelInfo.personalReq
  const personalProgressMax = Math.max(nextPersonalReq, 1)

  // 层级徽章 + 展开/收起：默认展开到第 2 层，深层点击展开，避免首屏渲染过多节点
  const NetworkNode = ({ node, defaultExpanded = true }) => {
    const [expanded, setExpanded] = useState(defaultExpanded)
    const hasChildren = node.children.length > 0
    return (
      <div className={`network-node ${node.depth === 0 ? 'network-node-root' : ''}`}>
        <div className="network-node-content">
          <div className="network-node-main">
            <div className="network-node-line1">
              {node.depth > 0 && <span className="network-node-depth">L{node.depth}</span>}
              <span className="network-node-address">{formatAddress(node.address)}</span>
              <span className="level-badge">{getLevelName(node.level)}</span>
            </div>
            <span className="network-node-meta">会员 ID: {node.memberId || '-'} · 直推 {node.referralCount} 人 · {formatNumber(node.personalAmount)} USDT</span>
          </div>
          <div className="network-node-stats">
            <span className="network-node-amount">{formatNumber(node.personalAmount)} USDT</span>
            {hasChildren && (
              <button
                type="button"
                className="network-node-toggle"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? `收起 ▴` : `展开 ${node.children.length} 人 ▾`}
              </button>
            )}
          </div>
        </div>
        {hasChildren && expanded && (
          <div className="network-node-children">
            {node.children.map((child) => (
              <NetworkNode
                key={`${child.address}-${child.depth}`}
                node={child}
                defaultExpanded={child.depth < 2}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const directListContent = (
    <>
      {referrals.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M17 21V19A4 4 0 0013 15H5A4 4 0 001 19V21M9 11A4 4 0 109 3A4 4 0 009 11M23 21V19A4 4 0 0019 15M16 3.13A4 4 0 0116 11.87" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>暂无直推用户</p>
        </div>
      ) : (
        <div className="info-list">
          {referralStats.map((stat, idx) => (
            <div className="info-row" key={stat.address}>
              <div className="referral-item">
                <span className="referral-index">{idx + 1}</span>
                <div className="referral-info">
                  <span className="info-label">{formatAddress(stat.address)}</span>
                  <span className="referral-sub">
                    直推 {stat.count} 人 · {formatNumber(stat.personalAmount)} USDT · {getLevelName(stat.level)}
                  </span>
                </div>
              </div>
              <a
                href={`${BSC_EXPLORER}/address/${stat.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-btn"
              >
                查看
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  )

  const networkContent = (
    <>
      {networkLoading ? (
        <div className="page-loading" style={{ minHeight: 200 }}>
          <div className="loading-spinner"></div>
          <p>加载网络中...</p>
        </div>
      ) : networkTree && networkTree.children.length > 0 ? (
        <div className="network-tree">
          <NetworkNode node={networkTree} />
        </div>
      ) : (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M17 21V19A4 4 0 0013 15H5A4 4 0 001 19V21M9 11A4 4 0 109 3A4 4 0 009 11M23 21V19A4 4 0 0019 15M16 3.13A4 4 0 0116 11.87" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>暂无推荐网络</p>
        </div>
      )}
    </>
  )

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">团队</h1>
        <p className="page-subtitle">查看您的团队业绩和等级信息</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M17 21V19A4 4 0 0013 15H5A4 4 0 001 19V21M9 11A4 4 0 109 3A4 4 0 009 11M23 21V19A4 4 0 0019 15M16 3.13A4 4 0 0116 11.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">团队总业绩</p>
            <p className="stat-value">{formatNumber(teamVolume)}</p>
            <StatChange value="+0.00%" direction="up" />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">小区业绩</p>
            <p className="stat-value">{formatNumber(subAreaVolume)}</p>
            <StatChange value="+0.00%" direction="up" />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 21H21M5 21V7L13 3L21 7V21M9 21V13H15V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">大区业绩</p>
            <p className="stat-value">{formatNumber(maxAreaVolume)}</p>
            <StatChange value="+0.00%" direction="up" />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 11L12 14L22 4M21 12V19A2 2 0 0119 21H5A2 2 0 013 19V5A2 2 0 015 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">当前等级</p>
            <p className="stat-value">{getLevelName(currentLevel)}</p>
            <Badge variant="gold">{currentLevelInfo.rewardRate}% 奖励</Badge>
          </div>
        </div>
      </div>

      <Card
        title="团队网络"
        subtitle={`最多展示 ${MAX_NETWORK_DEPTH} 层 · 共 ${networkTree ? networkTree.children.length : 0} 位直推`}
        className="mb-4"
      >
        <Tabs
          tabs={[
            { label: '直推列表', content: directListContent },
            { label: '团队网络', content: networkContent }
          ]}
          defaultActive={0}
        />
      </Card>

      <div className="team-grid">
        <Card title="等级进度" subtitle={`当前: ${getLevelName(currentLevel)}`} featured>
          {nextLevelInfo ? (
            <>
              <div className="level-progress">
                <div className="level-progress-header">
                  <span>升级至 {nextLevelInfo.name}</span>
                  <small>个人 {nextLevelInfo.personalReq.toLocaleString()} + 小区 {nextLevelInfo.subAreaReq.toLocaleString()} USDT</small>
                </div>
              </div>
              <ProgressBar
                label="个人业绩进度"
                value={personalAmountNum.toFixed(4)}
                max={personalProgressMax.toFixed(4)}
                suffix="USDT"
                variant="green"
              />
              <ProgressBar
                label="小区业绩进度"
                value={safeNumber(formatEther(subAreaVolume)).toFixed(4)}
                max={nextLevelInfo.subAreaReq.toFixed(4)}
                suffix="USDT"
                variant="green"
              />
            </>
          ) : (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>您已达到最高等级</p>
            </div>
          )}
        </Card>

        <Card title="团队结构" subtitle={`直推 ${referrals.length} 人`}>
          {referrals.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M17 21V19A4 4 0 0013 15H5A4 4 0 001 19V21M9 11A4 4 0 109 3A4 4 0 009 11M23 21V19A4 4 0 0019 15M16 3.13A4 4 0 0116 11.87" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>暂无直推用户</p>
            </div>
          ) : (
            <div className="info-list">
              {referrals.slice(0, 5).map((addr, idx) => (
                <div className="info-row" key={addr}>
                  <span className="info-label">{idx + 1}. {formatAddress(addr)}</span>
                  <a
                    href={`${BSC_EXPLORER}/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-btn"
                  >
                    查看
                  </a>
                </div>
              ))}
              {referrals.length > 5 && (
                <div className="info-row">
                  <span className="info-label">还有 {referrals.length - 5} 位直推</span>
                  <span className="info-value">...</span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="team-grid">
        <Card title="团队奖励规则" subtitle="团队奖 = 直推奖 + 级差奖 + 平级/超越奖">
          <div className="reward-rule-list">
            <div className="reward-rule-item">
              <span className="reward-rule-dot" style={{ background: '#B8860B' }}></span>
              <span className="reward-rule-text">
                <strong>直推奖：</strong>拿直推下级静态收益 × 自己的级别费率（全额）。例如 M3 直推的账户产生静态收益，M3 拿其 15%。
              </span>
            </div>
            <div className="reward-rule-item">
              <span className="reward-rule-dot" style={{ background: '#3B82F6' }}></span>
              <span className="reward-rule-text">
                <strong>级差奖：</strong>隔代下级按费率差计算。M4(20%) 伞下路径最高 M3(15%) 时，M4 拿每个隔代账户静态收益的 5%；逐级只拿级差，总拨出封顶 45%（M9）。
              </span>
            </div>
            <div className="reward-rule-item">
              <span className="reward-rule-dot" style={{ background: '#EF4444' }}></span>
              <span className="reward-rule-text">
                <strong>平级/超越奖：</strong>直推下级级别 ≥ 自己时，拿下级动态收益（直推+级差）的 10%。
              </span>
            </div>
            <div className="reward-rule-item">
              <span className="reward-rule-dot" style={{ background: '#10B981' }}></span>
              <span className="reward-rule-text">
                <strong>自动结算：</strong>团队奖以 XMR 记账，随静态收益周期自动发放，升级考核只看小区业绩。
              </span>
            </div>
          </div>
        </Card>

        <Card title="等级体系" subtitle="M1-M9 等级要求及团队奖励比例">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>等级</th>
                  <th>个人业绩</th>
                  <th>小区业绩</th>
                  <th>奖励比例</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {LEVEL_INFO.map((level) => (
                  <tr
                    key={level.level}
                    className={level.level === currentLevel ? 'row-highlight' : ''}
                  >
                    <td className="text-bold">{level.name}</td>
                    <td>{level.personalReq.toLocaleString()}</td>
                    <td>{level.subAreaReq.toLocaleString()}</td>
                    <td className="text-gold">{level.rewardRate}%</td>
                    <td>
                      {level.level === currentLevel ? (
                        <span className="status-tag status-tag-success">当前</span>
                      ) : level.level < currentLevel ? (
                        <span className="status-tag status-tag-info">已达成</span>
                      ) : (
                        <span className="status-tag status-tag-default">未达成</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="12代奖励比例" subtitle="代数奖励分配">
          <div className="generation-grid">
            {GENERATION_RATES.map((gen) => (
              <div key={gen.generation} className="generation-item">
                <div className="generation-num">{gen.generation}代</div>
                <div className="generation-rate">{gen.rate}%</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
