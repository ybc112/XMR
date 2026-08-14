# 多签操作指南（客户版）

> 本指南面向合约管理员（多签 owner）。**所有签名操作都通过您自己的钱包完成，私钥不会离开您的浏览器，无需提供给任何人。**

## 基本信息

- **多签合约**：`0x0E51A79183e701F4a35cD1Cc2655BE35c0e3f0b5`
- **当前 owner（3 个）**：
  1. `0xC785D31F61234630E5632141cE4ed3d64C79aBC4`
  2. `0xb1431c451ad866793e3fb1E3bE41C3E22883c518`
  3. `0x8254fE8BA6F074704312bf1dB51c7C42e7E859cE`
- **当前确认阈值**：2/3（即将改为 3/3）
- **操作入口**：`https://xmr-beta.vercel.app` → 管理员页面 → 多签操作（或使用 BscScan，见文末备选方式）

> ⚠️ 操作前请确认 MetaMask 已切换到 **BNB Smart Chain 主网**（链 ID 56），且钱包里有少量 BNB 用于 gas（0.01 BNB 足够）。

---

## 操作一：确认阈值改为 3/3（所有 owner 都要签名）

> 说明：owner 列表不变（还是 3 个），只把签名门槛从 2 个提高到 3 个。执行本操作时阈值还是 2，所以 **只需 2 个 owner 签名**；完成后，后续所有操作需要 3 个 owner 都签名。

### 第 1 步（owner1 提交）
1. 用 owner1 钱包（`0xC785...`）打开 `https://xmr-beta.vercel.app`
2. 进入 **管理员页面**（连接钱包后自动识别管理员）
3. 找到 **多签操作** 区域：
   - 函数：`changeRequirement`
   - 参数：`3`
4. 点击提交并确认钱包签名（提交自动算 1 个确认）

### 第 2 步（owner2 确认）
1. 换成 owner2 钱包（`0xb143...`）打开同一页面
2. 在 **多签交易列表** 中找到刚才那笔交易，点击 **确认**
3. 钱包签名 → 确认数达到 2/2 → **自动执行** ✅

### 验证
交易执行后，多签区域会显示 `required = 3`。

---

## 操作二：添加合约管理员 addAdmin（阈值 3/3，需要 3 个 owner 签名）

> 管理员地址（operator）可调用 `dailySettlement`、`setXMRPrice`、`processXMRWithdrawal` 等日常管理函数。

### 第 1 步（owner1 提交）
- 函数：`addAdmin`
- 参数：`<管理员钱包地址>`
- destination 填多签地址，提交

### 第 2 步（owner2 确认）
- 交易列表中确认该交易（确认数 2/3，不执行）

### 第 3 步（owner3 确认）
- 换成 owner3 钱包（`0x8254...`）确认 → 3/3 → **自动执行** ✅

---

## 操作三：设置 XMR 价格 dailySettlement（需要 3 个 owner 签名）

> 不设置价格，静态奖励无法按 XMR 铸造发放。

- 函数：`dailySettlement`
- 参数：`<XMR 单价，单位 USDT×10^18>`（例如 XMR 单价 100 USDT 填 `100000000000000000000`）
- 提交后 owner2、owner3 依次确认 → 自动执行

---

## 操作四：后续日常管理

阈值 3/3 生效后，**所有**多签操作（改费率、改算力、拉黑名单、紧急暂停、处理 XMR 提现等）都按同样流程：owner1 提交 → owner2 确认 → owner3 确认 → 自动执行。

---

## 备选操作方式：BscScan 直接调用

如果前端页面不可用，可以直接在 BscScan 上操作：

1. 打开 `https://bscscan.com/address/0x0E51A79183e701F4a35cD1Cc2655BE35c0e3f0b5#writeContract`
2. 点 **Connect to Web3**，用 owner 钱包签名连接
3. 调用 `submitTransaction`：
   - `destination`：`0x0E51A79183e701F4a35cD1Cc2655BE35c0e3f0b5`（多签自己）
   - `value`：`0`
   - `data`：目标操作编码后的 calldata

常用 calldata：

| 操作 | calldata |
|---|---|
| `changeRequirement(3)` | `0xba51a6df0000000000000000000000000000000000000000000000000000000000000003` |
| `addAdmin(0x...)` | `0x70480275` + `000000000000000000000000` + `<管理员地址去0x>`（共 68 字节） |
| `dailySettlement(100e18)`（XMR 单价 100 USDT） | `0x676092ed000000000000000000000000000000000000000000000000056bc75e2d63100000` |

4. 其他 owner 连接钱包调用 `confirmTransaction(txId)`（txId 从 0 开始递增，可在多签状态里查看 transactionCount）
5. 确认数达到阈值时自动执行

> ⚠️ 任意地址都能调用 `submitTransaction`（垃圾交易风险），请只确认你们自己提交的交易。

---

## 安全提醒

- 私钥不要发给任何人、不要输入到任何第三方网站
- MetaMask 只连接你们确认过的官方域名（`xmr-beta.vercel.app`）
- 每次操作前核对多签地址 `0x0E51...f0b5`
