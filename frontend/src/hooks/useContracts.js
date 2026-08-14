import { useCallback } from 'react'
import { useWeb3 } from '../contexts/Web3Context.jsx'
import { CONTRACT_ADDRESSES } from '../config/contracts.js'
import { ethers } from 'ethers'

/**
 * 合约交互 Hook
 * 提供合约实例和通用合约调用方法
 */
export function useContracts() {
  const {
    account,
    signer,
    provider,
    getStakingContract,
    getUSDTContract,
    getXMRTokenContract,
    getMultiSigContract,
    getReadOnlyProvider,
    isConnected
  } = useWeb3()

  // 获取 StakingDApp 合约
  const stakingContract = useCallback((withSigner = true) => {
    return getStakingContract(withSigner)
  }, [getStakingContract])

  // 获取 USDT 合约
  const usdtContract = useCallback((withSigner = true) => {
    return getUSDTContract(withSigner)
  }, [getUSDTContract])

  // 获取 XMRToken 合约
  const xmrTokenContract = useCallback((withSigner = true) => {
    return getXMRTokenContract(withSigner)
  }, [getXMRTokenContract])

  // 获取 MultiSigWallet 合约
  const multiSigContract = useCallback((withSigner = true) => {
    return getMultiSigContract(withSigner)
  }, [getMultiSigContract])

  // 检查 USDT 授权额度
  const checkAllowance = useCallback(async (owner, spender) => {
    try {
      const contract = getUSDTContract(false) || new ethers.Contract(
        CONTRACT_ADDRESSES.USDT,
        ['function allowance(address,address) view returns (uint256)'],
        getReadOnlyProvider()
      )
      const allowance = await contract.allowance(owner, spender)
      return allowance
    } catch (err) {
      console.error('检查授权额度失败:', err)
      return 0n
    }
  }, [getUSDTContract, getReadOnlyProvider])

  // USDT 授权
  const approveUSDT = useCallback(async (spender, amount) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = getUSDTContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.approve(spender, amount)
    await tx.wait()
    return tx
  }, [getUSDTContract, isConnected])

  // 获取 USDT 余额
  const getUSDTBalance = useCallback(async (address) => {
    try {
      const contract = getUSDTContract(false) || new ethers.Contract(
        CONTRACT_ADDRESSES.USDT,
        ['function balanceOf(address) view returns (uint256)'],
        getReadOnlyProvider()
      )
      const balance = await contract.balanceOf(address)
      return balance
    } catch (err) {
      console.error('获取USDT余额失败:', err)
      return 0n
    }
  }, [getUSDTContract, getReadOnlyProvider])

  // 获取 XMR 余额
  const getXMRBalance = useCallback(async (address) => {
    try {
      const readOnlyProvider = getReadOnlyProvider()
      const contract = getXMRTokenContract(false) || new ethers.Contract(
        CONTRACT_ADDRESSES.XMRToken,
        ['function balanceOf(address) view returns (uint256)'],
        readOnlyProvider
      )
      const balance = await contract.balanceOf(address)
      return balance
    } catch (err) {
      console.error('获取XMR余额失败:', err)
      return 0n
    }
  }, [getXMRTokenContract, getReadOnlyProvider])

  return {
    stakingContract,
    usdtContract,
    xmrTokenContract,
    multiSigContract,
    checkAllowance,
    approveUSDT,
    getUSDTBalance,
    getXMRBalance,
    account,
    signer,
    provider,
    isConnected
  }
}
