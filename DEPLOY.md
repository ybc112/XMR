# 部署核对清单（Deployment Checklist）

> 目标链：BSC 主网（chainId 56）。测试网部署请把 `--network bsc` 换成 `--network bscTestnet`，并显式设置 `USDT_ADDRESS`。

## 部署前

- [ ] 根目录 `.env` 已配置（`hardhat.config.js` 已加载 dotenv）：

  | 变量 | 必填 | 说明 |
  |---|---|---|
  | `PRIVATE_KEY` | ✅ | 部署钱包私钥（部署 + 初始 gas，部署后不再需要） |
  | `BSC_RPC_URL` | ✅ | BSC 主网 RPC |
  | `MULTISIG_OWNERS` | ✅ | 多签管理员地址，逗号分隔 |
  | `MULTISIG_REQUIRED` | ✅ | 确认阈值，**必须 ≤ owners 数量**，否则部署失败 |
  | `USDT_ADDRESS` | 测试网必填 | 主网默认 `0x55d398326f99059fF775485246999027B3197955` |
  | `BSCSCAN_API_KEY` | 验证时用 | BscScan 合约验证 |

- [ ] 部署钱包余额 ≥ 0.02 BNB（约 3 笔合约部署 + 3 笔交易，具体以实时 gas 为准）
- [ ] 多签 owner 钱包地址已核对（EIP-55 校验和格式），owner 私钥各自妥善保管

## 部署步骤

```bash
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network bsc
```

部署成功后脚本会输出 3 个合约地址（XMRToken / StakingDApp / MultiSigWallet）。

## 部署后（必须完成，否则合约无法运行）

- [ ] 1. 通过 MultiSigWallet 提交并签名：`StakingDApp.addAdmin(管理员地址)`（至少 required 个 owner 确认）
- [ ] 2. 通过 MultiSigWallet 提交并签名：`StakingDApp.dailySettlement(xmrPrice)` 设置 XMR 初始价格
- [ ] 3. 用 `BSCSCAN_API_KEY` 在 BscScan 验证 3 个合约（solidity 0.8.20 + viaIR + optimizer 200）
- [ ] 4. 更新 `frontend/src/config/contracts.js` 的 3 个合约地址
- [ ] 5. 更新 `backend/.env`：3 个合约地址 + `ADMIN_PRIVATE_KEY` + `ADMIN_API_KEY`（替换默认值）

## 多签操作流程（部署后所有管理操作都走这里）

1. owner A 在前端 Admin 页或通过合约 `submitTransaction(StakingDApp, calldata)` 提交交易
2. 其余 owner 调用 `confirmTransaction(txId)`，凑够 `MULTISIG_REQUIRED` 个签名
3. 任一 owner 调用 `executeTransaction(txId)` 执行

> ⚠️ 注意：owner 提交的 `submitTransaction` 没有 `ownerExists` 限制，任意地址都能提交垃圾交易，上线后需留意 `transactionCount`。
