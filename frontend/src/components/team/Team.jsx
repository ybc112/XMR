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
import { formatNumber, formatAddress, formatEther, getLevelName } from '../../utils/format.js'
import { LEVEL_INFO, GENERATION_RATES } from '../../utils/constants.js'

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
    setLoading(true)
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
      const visited = new Set()

      const buildNode = async (address, depth) => {
        const node = { address, depth, children: [] }
        const info = await getUserInfo(address)
        if (info) {
          node.memberId = info.memberId ? Number(info.memberId) : 0
          node.personalAmount = info.personalAmount || 0n
          node.level = info.level !== undefined ? Number(info.level) : 0
          node.referralCount = info.teamTotalVolume ? Number(info.teamTotalVolume) : 0
        } else {
          node.memberId = 0
          node.personalAmount = 0n
          node.level = 0
          node.referralCount = 0
        }

        if (depth < MAX_NETWORK_DEPTH && !visited.has(address.toLowerCase())) {
          visited.add(address.toLowerCase())
          const refs = await getDirectReferrals(address)
          for (const ref of refs) {
            const child = await buildNode(ref, depth + 1)
            node.children.push(child)
          }
        }

        return node
      }

      const root = await buildNode(account, 0)
      setNetworkTree(root)
    } catch (err) {
      console.error('加载推荐网络失败:', err)
      showError('加载推荐网络失败')
    } finally {
      setNetworkLoading(false)
    }
  }, [account, getUserInfo, getDirectReferrals, showError])

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

  const teamVolumeNum = Number(formatEther(teamVolume))
  const nextVolumeReq = nextLevelInfo ? nextLevelInfo.volumeReq : currentLevelInfo.volumeReq
  const levelProgressMax = nextLevelInfo ? nextVolumeReq : Math.max(currentLevelInfo.volumeReq, 1)

  const NetworkNode = ({ node }) => (
    <div className={`network-node ${node.depth === 0 ? 'network-node-root' : ''}`}>
      <div className="network-node-content">
        <div className="network-node-main">
          <span className="network-node-address">{formatAddress(node.address)}</span>
          <span className="network-node-meta">会员 ID: {node.memberId || '-'}</span>
        </div>
        <div className="network-node-stats">
          <span className="network-node-amount">{formatNumber(node.personalAmount)} USDT</span>
          <span className="level-badge">{getLevelName(node.level)}</span>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="network-node-children">
          {node.children.map((child) => (
            <NetworkNode key={`${child.address}-${child.depth}`} node={child} />
          ))}
        </div>
      )}
    </div>
  )

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
                href={`https://bscscan.com/address/${stat.address}`}
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
                  <small>团队业绩要求 {nextLevelInfo.volumeReq.toLocaleString()} USDT</small>
                </div>
              </div>
              <ProgressBar
                label="团队业绩进度"
                value={teamVolumeNum.toFixed(4)}
                max={levelProgressMax.toFixed(4)}
                suffix="USDT"
                variant="green"
              />
              <ProgressBar
                label="小区业绩进度"
                value={Number(formatEther(subAreaVolume)).toFixed(4)}
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
                    href={`https://bscscan.com/address/${addr}`}
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
        <Card title="等级体系" subtitle="M1-M9 等级要求及奖励">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>等级</th>
                  <th>团队业绩</th>
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
                    <td>{level.volumeReq.toLocaleString()}</td>
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
