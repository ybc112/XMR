import { useCallback } from 'react'
import { useWeb3 } from '../contexts/Web3Context.jsx'
import { useContracts } from './useContracts.js'

export function useMultiSig() {
  const { isConnected } = useWeb3()
  const { multiSigContract } = useContracts()

  const getContract = useCallback((withSigner = true) => {
    return multiSigContract(withSigner)
  }, [multiSigContract])

  const submitTransaction = useCallback(async (destination, value, data) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = getContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.submitTransaction(destination, value, data)
    await tx.wait()
    return tx
  }, [isConnected, getContract])

  const confirmTransaction = useCallback(async (txId) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = getContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.confirmTransaction(txId)
    await tx.wait()
    return tx
  }, [isConnected, getContract])

  const revokeConfirmation = useCallback(async (txId) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = getContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.revokeConfirmation(txId)
    await tx.wait()
    return tx
  }, [isConnected, getContract])

  const executeTransaction = useCallback(async (txId) => {
    if (!isConnected) throw new Error('请先连接钱包')
    const contract = getContract(true)
    if (!contract) throw new Error('合约未初始化')
    const tx = await contract.executeTransaction(txId)
    await tx.wait()
    return tx
  }, [isConnected, getContract])

  const getOwners = useCallback(async () => {
    const contract = getContract(false)
    if (!contract) return []
    try {
      return await contract.getOwners()
    } catch (err) {
      console.error('获取多签所有者失败:', err)
      return []
    }
  }, [getContract])

  const isOwner = useCallback(async (address) => {
    const contract = getContract(false)
    if (!contract) return false
    try {
      return await contract.isOwner(address)
    } catch (err) {
      console.error('检查所有者失败:', err)
      return false
    }
  }, [getContract])

  const getTransaction = useCallback(async (txId) => {
    const contract = getContract(false)
    if (!contract) return null
    try {
      const tx = await contract.getTransaction(txId)
      return {
        destination: tx[0],
        value: tx[1],
        data: tx[2],
        executed: tx[3],
        confirmCount: Number(tx[4])
      }
    } catch (err) {
      console.error('获取多签交易失败:', err)
      return null
    }
  }, [getContract])

  const getTransactionCount = useCallback(async (pending, executed) => {
    const contract = getContract(false)
    if (!contract) return 0
    try {
      const count = await contract.getTransactionCount(pending, executed)
      return Number(count)
    } catch (err) {
      console.error('获取多签交易数量失败:', err)
      return 0
    }
  }, [getContract])

  const required = useCallback(async () => {
    const contract = getContract(false)
    if (!contract) return 0
    try {
      const r = await contract.required()
      return Number(r)
    } catch (err) {
      console.error('获取所需确认数失败:', err)
      return 0
    }
  }, [getContract])

  const isConfirmedBy = useCallback(async (txId, address) => {
    const contract = getContract(false)
    if (!contract || !address) return false
    try {
      return await contract.confirmations(txId, address)
    } catch (err) {
      console.error('查询签名状态失败:', err)
      return false
    }
  }, [getContract])

  return {
    submitTransaction,
    confirmTransaction,
    revokeConfirmation,
    executeTransaction,
    getOwners,
    getTransaction,
    getTransactionCount,
    isOwner,
    required,
    isConfirmedBy
  }
}
