import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import {
  BSC_MAINNET,
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
    if (cid === BSC_MAINNET.chainId) return true;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BSC_MAINNET.chainId }],
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [BSC_MAINNET],
        });
      } else {
        throw err;
      }
    }
    const newCid = await window.ethereum.request({ method: 'eth_chainId' });
    return newCid === BSC_MAINNET.chainId;
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
      setChainOk(cid === BSC_MAINNET.chainId);
      if (cid === BSC_MAINNET.chainId) checkIdentity(account);
    };
    window.ethereum.on?.('accountsChanged', onAccounts);
    window.ethereum.on?.('chainChanged', onChain);

    // 静默恢复上次连接
    (async () => {
      try {
        const cid = await window.ethereum.request({ method: 'eth_chainId' });
        setChainOk(cid === BSC_MAINNET.chainId);
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

  /**
   * 多签 owner 直签提交一笔多签操作（onlyOwner 函数必须走多签）
   * @param {string[]} abi 目标合约 ABI（用于编码 calldata）
   * @param {string} fnName 函数名
   * @param {unknown[]} args 函数参数
   * @returns {Promise<string>} 多签交易编号 txId
   */
  const submitMultisigOp = useCallback(
    async (abi, fnName, args) => {
      if (!account) throw new Error('请先连接钱包');
      if (!isMsOwner) throw new Error('当前钱包不是多签 owner，无法提交该操作。请切换到 owner 钱包后重试。');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const iface = new ethers.Interface(abi);
      const data = iface.encodeFunctionData(fnName, args);
      const multisig = new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_ABI, signer);
      const txId = await multisig.submitTransaction.staticCall(STAKING_ADDRESS, 0, data);
      const tx = await multisig.submitTransaction(STAKING_ADDRESS, 0, data);
      await tx.wait();
      return txId.toString();
    },
    [account, isMsOwner],
  );

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
      submitMultisigOp,
      // 连接了钱包且在正确链上 → 操作走前端直签
      canSignDirectly: !!account && chainOk,
    }),
    [account, chainOk, connecting, hasWallet, isContractAdmin, isMsOwner, connect, disconnect, getStakingWithSigner, submitMultisigOp],
  );

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function usePanelWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error('usePanelWallet 必须在 PanelWalletProvider 内使用');
  return ctx;
}
