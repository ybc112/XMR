# 多签操作指南（客户版 · BSC 主网）

> 本指南面向合约管理员（多签 owner）。**所有签名操作都通过您自己的钱包完成，私钥不会离开您的浏览器，无需提供给任何人。**

## 基本信息（2026-08-18 主网正式部署）

- **StakingDApp 合约**：`0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`
- **多签合约**：`0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f`
- **XMRToken 合约**：`0x6b4B901c5F41b843F91CAbF142738Af95690B2F8`
- **USDT（BSC 官方）**：`0x55d398326f99059fF775485246999027B3197955`
- **当前 owner（3 个）**：
  1. `0xC785D31F61234630E5632141cE4ed3d64C79aBC4`
  2. `0xb1431c451ad866793e3fb1E3bE41C3E22883c518`
  3. `0x8254fE8BA6F074704312bf1dB51c7C42e7E859cE`
- **当前确认阈值**：2/3
- **操作入口**：`https://www.xmr-plan.com/panel` → 多签页面

> ⚠️ 操作前请确认 MetaMask 已切换到 **BNB Smart Chain 主网**（链 ID 56），且钱包里有少量 BNB 用于 gas（0.01 BNB 足够）。

---

## ⚠️ 最重要：destination（目标合约）怎么填

多签操作中 **destination 必须是目标函数所在的合约**，填错会"执行成功但毫无效果"：

| 要调用的函数 | 所属合约 | destination 填 |
|---|---|---|
| `addAdmin` / `setXMRPrice` / `dailySettlement` / `processXMRWithdrawal` / `emergencyPause` 等 | StakingDApp | **`0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`** |
| `changeRequirement` / `addOwner` / `removeOwner` 等 | 多签自身 | `0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f` |

> 例如：把 `addAdmin` 发到多签地址或任何其他地址，交易会显示"已执行"，但新主网合约上管理员并没有增加 —— 请务必核对 destination。

---

## 操作一（可选）：确认阈值改为 3/3（所有 owner 都要签名）

> 说明：owner 列表不变（还是 3 个），只把签名门槛从 2 个提高到 3 个。执行本操作时阈值还是 2，所以 **只需 2 个 owner 签名**；完成后，后续所有操作需要 3 个 owner 都签名。

### 第 1 步（owner1 提交）
1. 用 owner1 钱包（`0xC785...`）打开 `https://www.xmr-plan.com/panel`
2. 进入 **多签页面**
3. 提交交易：
   - destination：`0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f`（多签自己）
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

## 操作二：添加合约管理员 addAdmin（最常用）

> 管理员地址（operator）可调用 `dailySettlement`、`setXMRPrice`、`processXMRWithdrawal` 等日常管理函数。**当前合约还没有任何管理员，上线前必须执行本操作。**

### 第 1 步（owner1 提交）
- **destination：`0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`**（StakingDApp！）
- 函数：`addAdmin`
- 参数：`<管理员钱包地址>`，例如运营钱包 `0x9163e6FD1767130b740fDc3Df120001b4dBf1177`
- 提交并签名（提交自动算 1 个确认）

### 第 2 步（owner2 确认）
- 交易列表中确认该交易（阈值 2/3 时确认数达到 2 即自动执行）

### 第 3 步（阈值 3/3 时）owner3 确认
- 换成 owner3 钱包（`0x8254...`）确认 → 3/3 → **自动执行** ✅

### 验证
多签区域或合约 `admins(地址)` 显示 `true`；也可以在 BscScan 上查：
`https://bscscan.com/address/0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F#readContract` → `admins` 输入运营钱包地址 → 返回 `true` 即成功。

---

## 操作三：设置 XMR 价格 setXMRPrice / dailySettlement

> 不设置价格，静态奖励无法按 XMR 铸造发放。**价格取实时价**（例如 2026-08-18 实时价 ≈ 409.87 USDT），可到 Gate.io 永续合约页查看：`https://www.gate.io/zh/futures/USDT/XMR_USDT`

- **destination：`0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`**
- 函数：`setXMRPrice`（只改价格）或 `dailySettlement`（改价格并结算上一周期收益）
- 参数：`<XMR 单价，单位 USDT×10^18>`（例如 409.87 USDT 填 `409870000000000000000`）
- 提交后按阈值由其他 owner 依次确认 → 自动执行

> 正式运营后每天北京时间 12:01 由后端自动执行 `dailySettlement`（自动取实时价），无需人工。

---

## 操作四：后续日常管理

阈值生效后，**所有**多签操作（处理 XMR 提现、拉黑名单、紧急暂停、调整余额等）都按同样流程：owner1 提交 → owner2（及 owner3）确认 → 自动执行。destination 一律填 **StakingDApp** `0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`。

---

## 备选操作方式：BscScan 直接调用

如果前端页面不可用，可以直接在 BscScan 上操作：

1. 打开 `https://bscscan.com/address/0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f#writeContract`
2. 点 **Connect to Web3**，用 owner 钱包签名连接
3. 调用 `submitTransaction`：
   - `destination`：**目标合约**（addAdmin 等 → `0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`；changeRequirement 等 → 多签 `0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f`）
   - `value`：`0`
   - `data`：目标操作编码后的 calldata

常用 calldata：

| 操作 | calldata |
|---|---|
| `changeRequirement(3)` | `0xba51a6df0000000000000000000000000000000000000000000000000000000000000003` |
| `addAdmin(0x9163e6FD1767130b740fDc3Df120001b4dBf1177)` | `0x704802750000000000000000000000009163e6fd1767130b740fdc3df120001b4dbf1177` |
| `setXMRPrice(409.87e18)` | `0x5738eee40000000000000000000000000000000000000000000000163816c16a695b0000` |

> `setXMRPrice` 的选择器 `0x5738eee4`、`addAdmin` 的选择器 `0x70480275` 可在 BscScan 的 `writeContract` 页用"Write"表单自动生成，无需手拼 calldata。数值部分随价格变化：价格 × 10^18 转 16 进制（如 409.87 → `0x163816c16a695b0000`）。

4. 其他 owner 连接钱包调用 `confirmTransaction(txId)`（txId 从 0 开始递增，可在多签状态里查看 transactionCount）
5. 确认数达到阈值时自动执行

> ⚠️ 任意地址都能调用 `submitTransaction`（垃圾交易风险），请只确认你们自己提交的交易。

---

## 安全提醒

- 私钥不要发给任何人、不要输入到任何第三方网站
- MetaMask 只连接你们确认过的官方域名（`www.xmr-plan.com`）
- 每次操作前核对：
  - 多签地址 `0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f`
  - StakingDApp 地址 `0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`
- 若在多签交易列表看到非你们提交的交易（destination 异常/参数异常），不要确认
