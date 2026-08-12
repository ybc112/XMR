import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../config/contracts.js'
import { STAKING_DAPP_ABI, USDT_ABI, XMR_TOKEN_ABI, MULTISIG_WALLET_ABI } from '../config/abis.js'

const Web3Context = createContext(null)

export function Web3Provider({ children }) {
  const [account, setAccount] = useState('')
  const [chainId, setChainId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [error, setError] = useState('')
  const initializedRef = useRef(false)

  // 检查是否安装了 MetaMask
  const checkIfWalletInstalled = useCallback(() => {
    return typeof window.ethereum !== 'undefined'
  }, [])

  // 切换到 BSC 链
  const switchToBSC = useCallback(async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK_CONFIG.chainId }]
      })
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [NETWORK_CONFIG]
          })
        } catch (addError) {
          console.error('添加BSC链失败:', addError)
          setError('添加BSC链失败，请手动添加')
        }
      } else {
        console.error('切换到BSC链失败:', switchError)
        setError('请切换到BSC链')
      }
    }
  }, [])

  // 检查管理员状态
  const checkAdminStatus = useCallback(async (userAccount, userProvider) => {
    if (!userAccount) return
    try {
      const stakingContract = new ethers.Contract(
        CONTRACT_ADDRESSES.StakingDApp,
        STAKING_DAPP_ABI,
        userProvider
      )
      const [isAddrAdmin, contractOwner] = await Promise.all([
        stakingContract.admins(userAccount),
        stakingContract.owner()
      ])
      setIsAdmin(isAddrAdmin || contractOwner.toLowerCase() === userAccount.toLowerCase())
    } catch (err) {
      console.error('检查管理员状态失败:', err)
      setIsAdmin(false)
    }
  }, [])

  // 连接钱包
  const connectWallet = useCallback(async () => {
    if (!checkIfWalletInstalled()) {
      setError('请先安装 MetaMask 钱包')
      window.open('https://metamask.io/download/', '_blank')
      return
    }

    setIsConnecting(true)
    setError('')
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      })

      if (accounts.length > 0) {
        setAccount(accounts[0])
        setIsConnected(true)

        const browserProvider = new ethers.BrowserProvider(window.ethereum)
        const browserSigner = await browserProvider.getSigner()
        setProvider(browserProvider)
        setSigner(browserSigner)

        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })
        setChainId(currentChainId)

        if (currentChainId !== NETWORK_CONFIG.chainId) {
          await switchToBSC()
        }

        await checkAdminStatus(accounts[0], browserProvider)
      }
    } catch (err) {
      console.error('连接钱包失败:', err)
      setError(err.message || '连接钱包失败')
    } finally {
      setIsConnecting(false)
    }
  }, [checkIfWalletInstalled, switchToBSC, checkAdminStatus])

  // 断开连接
  const disconnectWallet = useCallback(() => {
    setAccount('')
    setIsConnected(false)
    setProvider(null)
    setSigner(null)
    setIsAdmin(false)
    setChainId('')
  }, [])

  // 监听账户和链变化
  useEffect(() => {
    if (!checkIfWalletInstalled()) return
    if (initializedRef.current) return
    initializedRef.current = true

    // 检查是否已经连接
    const checkConnection = async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setAccount(accounts[0])
          setIsConnected(true)
          const browserProvider = new ethers.BrowserProvider(window.ethereum)
          const browserSigner = await browserProvider.getSigner()
          setProvider(browserProvider)
          setSigner(browserSigner)
          const currentChainId = await window.ethereum.request({ method: 'eth_chainId' })
          setChainId(currentChainId)
        }
      } catch (err) {
        console.error('检查连接状态失败:', err)
      }
    }

    checkConnection()

    // 监听账户变化
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet()
      } else {
        setAccount(accounts[0])
        window.location.reload()
      }
    }

    // 监听链变化
    const handleChainChanged = (newChainId) => {
      setChainId(newChainId)
      window.location.reload()
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
        window.ethereum.removeListener('chainChanged', handleChainChanged)
      }
    }
  }, [checkIfWalletInstalled, disconnectWallet])

  // 获取合约实例
  const getStakingContract = useCallback((withSigner = true) => {
    if (!signer && withSigner) return null
    return new ethers.Contract(
      CONTRACT_ADDRESSES.StakingDApp,
      STAKING_DAPP_ABI,
      withSigner ? signer : provider
    )
  }, [signer, provider])

  const getUSDTContract = useCallback((withSigner = true) => {
    if (!signer && withSigner) return null
    return new ethers.Contract(
      CONTRACT_ADDRESSES.USDT,
      USDT_ABI,
      withSigner ? signer : provider
    )
  }, [signer, provider])

  const getXMRTokenContract = useCallback((withSigner = true) => {
    if (!signer && withSigner) return null
    return new ethers.Contract(
      CONTRACT_ADDRESSES.XMRToken,
      XMR_TOKEN_ABI,
      withSigner ? signer : provider
    )
  }, [signer, provider])

  const getMultiSigContract = useCallback((withSigner = true) => {
    if (!signer && withSigner) return null
    return new ethers.Contract(
      CONTRACT_ADDRESSES.MultiSigWallet,
      MULTISIG_WALLET_ABI,
      withSigner ? signer : provider
    )
  }, [signer, provider])

  // 只读 provider (用于不连接钱包时查询数据)
  const getReadOnlyProvider = useCallback(() => {
    return new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrls[0])
  }, [])

  const value = {
    account,
    chainId,
    isConnected,
    isConnecting,
    isAdmin,
    provider,
    signer,
    error,
    setError,
    connectWallet,
    disconnectWallet,
    switchToBSC,
    getStakingContract,
    getUSDTContract,
    getXMRTokenContract,
    getMultiSigContract,
    getReadOnlyProvider,
    isWalletInstalled: checkIfWalletInstalled()
  }

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>
}

export function useWeb3() {
  const context = useContext(Web3Context)
  if (!context) {
    throw new Error('useWeb3 must be used within Web3Provider')
  }
  return context
}
