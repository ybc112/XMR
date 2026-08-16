import { useCallback } from 'react'
import { useWeb3 } from '../contexts/Web3Context.jsx'
import { useContracts } from './useContracts.js'
import { ethers } from 'ethers'
import { CONTRACT_ADDRESSES } from '../config/contracts.js'
import { STAKING_DAPP_ABI } from '../config/abis.js'

export function useStaking() {
  const { account, isConnected, getReadOnlyProvider } = useWeb3()
  const {
    stakingContract,
    checkAllowance,
    approveUSDT
  } = useContracts()

  const getReadOnlyStakingContract = useCallback(() => {
    const readOnlyProvider = getReadOnlyProvider()
    if (!readOnlyProvider) return null
    try {
      return new ethers.Contract(
        CONTRACT_ADDRESSES.StakingDApp,
        STAKING_DAPP_ABI,
        readOnlyProvider
      )
    } catch (err) {
      console.error('创建只读算力合约失败:', err)
      return null
    }
  }, [getReadOnlyProvider])

  const register = useCallback(async (referrer) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.register(referrer)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const invest = useCallback(async (amount) => {
    if (!isConnected) throw new Error('请先连接钱包')
    if (!account) throw new Error('账户未连接')

    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')

    const amountWei = ethers.parseEther(amount.toString())

    const allowance = await checkAllowance(account, CONTRACT_ADDRESSES.StakingDApp)
    if (allowance < amountWei) {
      const maxApprove = ethers.MaxUint256
      await approveUSDT(CONTRACT_ADDRESSES.StakingDApp, maxApprove)
    }

    const tx = await contract.invest(amountWei)
    await tx.wait()
    return tx
  }, [isConnected, account, stakingContract, checkAllowance, approveUSDT])

  const claimStaticReward = useCallback(async () => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.claimStaticReward()
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const flashExchange = useCallback(async (xmrAmount) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const amountWei = ethers.parseEther(xmrAmount.toString())
    const tx = await contract.flashExchange(amountWei)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const withdrawUSDT = useCallback(async (amount) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const amountWei = ethers.parseEther(amount.toString())
    const tx = await contract.withdrawUSDT(amountWei)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const requestXMRWithdrawal = useCallback(async (amount) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const amountWei = ethers.parseEther(amount.toString())
    const tx = await contract.requestXMRWithdrawal(amountWei)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const getUserInfo = useCallback(async (address) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return null
    try {
      const userInfo = await contract.getUserInfo(address)
      return userInfo
    } catch (err) {
      console.error('获取用户信息失败:', err)
      return null
    }
  }, [getReadOnlyStakingContract])

  const getContractStats = useCallback(async () => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return null
    try {
      const stats = await contract.getContractStats()
      return stats
    } catch (err) {
      console.error('获取合约统计失败:', err)
      return null
    }
  }, [getReadOnlyStakingContract])

  const getDirectReferrals = useCallback(async (address) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return []
    try {
      const referrals = await contract.getDirectReferrals(address)
      return referrals
    } catch (err) {
      console.error('获取直推列表失败:', err)
      return []
    }
  }, [getReadOnlyStakingContract])

  const getDirectReferralCount = useCallback(async (address) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return 0
    try {
      const count = await contract.getDirectReferralCount(address)
      return count
    } catch (err) {
      console.error('获取直推数量失败:', err)
      return 0
    }
  }, [getReadOnlyStakingContract])

  const getRemainingExitLimit = useCallback(async (address) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return 0n
    try {
      const limit = await contract.getRemainingExitLimit(address)
      return limit
    } catch (err) {
      console.error('获取剩余出局额度失败:', err)
      return 0n
    }
  }, [getReadOnlyStakingContract])

  const getSubAreaVolume = useCallback(async (address) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return 0n
    try {
      const volume = await contract.getSubAreaVolume(address)
      return volume
    } catch (err) {
      console.error('获取小区业绩失败:', err)
      return 0n
    }
  }, [getReadOnlyStakingContract])

  const estimateStaticReward = useCallback(async (address) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return { usdtValue: 0n, xmrValue: 0n }
    try {
      const [usdtValue, xmrValue] = await contract.estimateStaticReward(address)
      return { usdtValue, xmrValue }
    } catch (err) {
      console.error('预估静态收益失败:', err)
      return { usdtValue: 0n, xmrValue: 0n }
    }
  }, [getReadOnlyStakingContract])

  const getLevelInfo = useCallback(async (level) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return null
    try {
      const info = await contract.getLevelInfo(level)
      return info
    } catch (err) {
      console.error('获取等级信息失败:', err)
      return null
    }
  }, [getReadOnlyStakingContract])

  const getRecentEarnings = useCallback(async (address, limit = 8) => {
    const contract = getReadOnlyStakingContract()
    if (!contract) return []
    try {
      const filters = [
        contract.filters.StaticRewardClaimed(address),
        contract.filters.GenerationReward(address),
        contract.filters.TeamReward(address),
        contract.filters.FlashExchanged(address),
        contract.filters.USDTWithdrawn(address),
        contract.filters.XMRWithdrawalRequested(address)
      ]

      const events = []
      for (const filter of filters) {
        const logs = await contract.queryFilter(filter, -9000, 'latest')
        for (const log of logs) {
          events.push({
            type: log.fragment.name,
            blockNumber: Number(log.blockNumber),
            transactionHash: log.transactionHash,
            args: log.args
          })
        }
      }

      events.sort((a, b) => b.blockNumber - a.blockNumber)
      return events.slice(0, limit)
    } catch (err) {
      console.error('获取最近收益失败:', err)
      return []
    }
  }, [getReadOnlyStakingContract])

  const setXMRPrice = useCallback(async (price) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.setXMRPrice(ethers.parseEther(price.toString()))
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const dailySettlement = useCallback(async (xmrPrice) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.dailySettlement(ethers.parseEther(xmrPrice.toString()))
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const setDailyRate = useCallback(async (rate) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.setDailyRate(ethers.parseEther(rate.toString()))
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const setComputingPower = useCallback(async (power) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.setComputingPower(power)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const setWithdrawFee = useCallback(async (fee) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.setWithdrawFee(fee)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const setBlacklist = useCallback(async (user, status) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.setBlacklist(user, status)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const emergencyPause = useCallback(async () => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.emergencyPause()
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const emergencyUnpause = useCallback(async () => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.emergencyUnpause()
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const addAdmin = useCallback(async (admin) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.addAdmin(admin)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const removeAdmin = useCallback(async (admin) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.removeAdmin(admin)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const processXMRWithdrawal = useCallback(async (user) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.processXMRWithdrawal(user)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const setUserComputingPower = useCallback(async (user, power) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.setUserComputingPower(user, power)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const adjustUserUSDT = useCallback(async (user, delta) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.adjustUserUSDT(user, delta)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const adjustUserXMR = useCallback(async (user, delta) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.adjustUserXMR(user, delta)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  const setXMRAddress = useCallback(async (xmrAddr) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = stakingContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.setXMRAddress(xmrAddr)
    await tx.wait()
    return tx
  }, [isConnected, stakingContract])

  return {
    register,
    invest,
    claimStaticReward,
    flashExchange,
    withdrawUSDT,
    requestXMRWithdrawal,
    setXMRAddress,
    getUserInfo,
    getContractStats,
    getDirectReferrals,
    getDirectReferralCount,
    getRemainingExitLimit,
    getSubAreaVolume,
    estimateStaticReward,
    getLevelInfo,
    getRecentEarnings,
    setXMRPrice,
    dailySettlement,
    setDailyRate,
    setComputingPower,
    setWithdrawFee,
    setBlacklist,
    emergencyPause,
    emergencyUnpause,
    addAdmin,
    removeAdmin,
    processXMRWithdrawal,
    setUserComputingPower,
    adjustUserUSDT,
    adjustUserXMR
  }
}
