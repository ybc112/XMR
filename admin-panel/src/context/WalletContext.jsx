import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import {
  BSC_TESTNET,
  STAKING_ABI,
  STAKING_ADDRESS,
  MULTISIG_ABI,
  MULTISIG_ADDRESS,
} from '../config/contracts';

const WalletCtx = createContext(null);

export function PanelWalletProvider({ children }) {
  const [account, setAccount] = useState('');
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isContractAdmin, setIsContractAdmin] = useState(false);
  const [isMsOwner, setIsMsOwner] = useState(false);
  const hasWallet = typeof window !== 'undefined' && !!window.ethereum;

  const checkIdentity = useCallback(async (addr) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const staking = new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, provider);
      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_ABI, provider);
      const [adminFlag, msOwnerFlag] = await Promise.all([
        staking.admins(addr).catch(() => false),
        multisig.isOwner(addr).catch(() => false),
      ]);
      setIsContractAdmin(!!adminFlag);
      setIsMsOwner(!!msOwnerFlag);
    } catch {
      setIsContractAdmin(false);
      setIsMsOwner(false);
    }
  }, []);

  const ensureChain = useCallback(async () => {
    const cid = await window.ethereum.request({ method: 'eth_chainId' });
    if (cid === BSC_TESTNET.chainId) return true;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BSC_TESTNET.chainId }],
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [BSC_TESTNET],
        });
      } else {
        throw err;
      }
    }
    const newCid = await window.ethereum.request({ method: 'eth_chainId' });
    return newCid === BSC_TESTNET.chainId;
  }, []);

  const connect = useCallback(async () => {
    if (!hasWallet) throw new Error('未检测到钱包插件，请先安装 MetaMask');
    setConnecting(true);
    try {
      await ensureChain();
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts && accounts[0];
      setAccount(addr || '');
      setChainOk(true);
      if (addr) await checkIdentity(addr);
      return addr;
    } finally {
      setConnecting(false);
    }
  }, [hasWallet, ensureChain, checkIdentity]);

  useEffect(() => {
    if (!hasWallet) return undefined;
    const onAccounts = (accs) => {
      const addr = accs && accs[0];
      setAccount(addr || '');
      if (addr) {
        checkIdentity(addr);
      } else {
        setIsContractAdmin(false);
        setIsMsOwner(false);
      }
    };
    const onChain = (cid) => {
      setChainOk(cid === BSC_TESTNET.chainId);
      if (cid === BSC_TESTNET.chainId) checkIdentity(account);
    };
    window.ethereum.on?.('accountsChanged', onAccounts);
    window.ethereum.on?.('chainChanged', onChain);

    // 静默恢复上次连接
    (async () => {
      try {
        const cid = await window.ethereum.request({ method: 'eth_chainId' });
        setChainOk(cid === BSC_TESTNET.chainId);
        const accs = await window.ethereum.request({ method: 'eth_accounts' });
        const addr = accs && accs[0];
        if (addr) {
          setAccount(addr);
          checkIdentity(addr);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccounts);
      window.ethereum.removeListener?.('chainChanged', onChain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = useCallback(() => {
    setAccount('');
    setIsContractAdmin(false);
    setIsMsOwner(false);
  }, []);

  const getStakingWithSigner = useCallback(async () => {
    if (!account) throw new Error('请先连接钱包');
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(STAKING_ADDRESS, STAKING_ABI, signer);
  }, [account]);

  const value = useMemo(
    () => ({
      account,
      chainOk,
      connecting,
      hasWallet,
      isContractAdmin,
      isMsOwner,
      connect,
      disconnect,
      getStakingWithSigner,
      // 连接了钱包且在正确链上 → 操作走前端直签
      canSignDirectly: !!account && chainOk,
    }),
    [account, chainOk, connecting, hasWallet, isContractAdmin, isMsOwner, connect, disconnect, getStakingWithSigner],
  );

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function usePanelWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error('usePanelWallet 必须在 PanelWalletProvider 内使用');
  return ctx;
}
