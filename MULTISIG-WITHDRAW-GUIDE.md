# 多签提取合约资产操作指南（withdrawToken）

> 适用场景：从 StakingDApp 合约提取 USDT / XMR / 其他代币到指定钱包（仅限多签 owner 操作）。
> 更新日期：2026-08-20 ｜ 主网合约：`0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`

---

## 一、原理速览（为什么不能直接转）

合约的 `withdrawToken` 是 **onlyOwner**，而 owner = **多签合约** `0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f`：

```
普通合约:  owner = 部署钱包(1个私钥) → 直接调 withdrawToken → 立即转出
本合约:    owner = 多签合约(3个owner,2个签名) → 必须走: 提交 → 确认×2 → 多签自动执行
```

任何单个 owner 钱包直接调合约都会被拒绝（`execution reverted`），**必须 2/3 签名**。

---

## 二、合约提取函数（BSC 主网）

| 函数 | 参数 | 权限 | 用途 |
|---|---|---|---|
| `withdrawToken(address _token, address _to, uint256 _amount)` | 代币地址、收款地址、金额(wei) | onlyOwner | 提取合约里任意 ERC20 代币 |
| `withdrawFees(address _to, uint256 _amount)` | 收款地址、金额(wei) | onlyOwner | 提取手续费（USDT） |
| `withdrawUSDT(uint256 _amount)` | 金额(wei) | 任何人 | 用户提自己的待提 USDT（不需要多签） |

### 常用代币地址

| 代币 | 地址 |
|---|---|
| USDT（BSC 官方） | `0x55d398326f99059fF775485246999027B3197955` |
| XMRToken（项目代币） | `0x6b4B901c5F41b843F91CAbF142738Af95690B2F8` |

### 金额换算（18 位精度）

| 想提取的数量 | 参数填的值（wei） |
|---|---|
| 1 个 | `1000000000000000000` |
| 100 个 | `100000000000000000000` |
| 1000 个 | `1000000000000000000000` |
| 10000 个 | `10000000000000000000000000` |

---

## 三、方式一：面板操作（推荐，无需 calldata）

**入口**：`https://xmr-plan.com/admin`（owner 钱包连接）

### 第 1 步（owner1 提交）
1. 用 **owner1 钱包**（`0xC785D31F...`）连接
2. 进入「多签操作」区域，填写：
   - **目标合约地址**：`0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`
   - **函数名**：`withdrawToken`
   - **参数（逗号分隔，3 个）**：
     ```
     0x55d398326f99059fF775485246999027B3197955,0xC785D31F61234630E5632141cE4ed3d64C79aBC4,100000000000000000000
     ```
     即：`<代币地址>,<收款地址>,<金额wei>`
   - **值（value）**：`0`
3. 点「提交交易」→ MetaMask 确认签名

### 第 2 步（owner2 确认）
1. 换成 **owner2 钱包**（`0xb1431c45...`）连接（切钱包后刷新页面）
2. 多签交易列表中找到刚才那笔（看「操作内容」列显示 `withdrawToken(...)`）
3. 点「确认」→ MetaMask 签名

### 第 3 步（自动执行）
确认数达到 **2/2** → 多签自动执行 → 代币到账收款地址 ✅

> 阈值如果已改为 3/3，则需要 owner3（`0x8254fE8B...`）也确认。

---

## 四、方式二：BscScan 操作（备选）

### 需要用的 calldata

提取 **100 USDT 到 owner1 钱包** 的完整 calldata（直接复制）：

```
0x01e3366700000000000000000000000055d398326f99059ff775485246999027b3197955000000000000000000000000c785d31f61234630e5632141ce4ed3d64c79abc40000000000000000000000000000000000000000000000056bc75e2d63100000
```

对应 `withdrawToken(0x55d398...USDT, 0xC785D31F...收款, 100e18)`。

> 金额不同时，最后 64 位（`0x56bc75e2d63100000`）是金额的十六进制（100e18 = 0x56bc75e2d63100000）。想提 1000 个：`0x3635c9adc5dea00000`。

### 操作步骤

1. 打开：`https://bscscan.com/address/0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f#writeContract`
2. 点 **Connect to Web3** → 选择 **owner1 钱包** → 签名连接
3. 找到 **submitTransaction**，填三项：
   - `destination (address)`：`0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F`（StakingDApp！）
   - `value (uint256)`：`0`
   - `data (bytes)`：**粘贴上面那段 calldata**
4. 点 **Write** → MetaMask 确认 → 等上链（10~30 秒）
5. **确认**：切 **owner2 钱包** → `confirmTransaction(_txId)`：
   - `_txId` 不知道是多少时，从 `0` 开始逐个试（Pending 的那笔会成功，已执行/不存在的会报错）
   - 或先 Read Contract → `transactionCount` 看总数，提交的 txId = 总数 - 1（上一笔）
6. Write → 签名 → 确认数达 2/2 → **自动执行** ✅

> ⚠️ BscScan 上任何地址都能调 `submitTransaction`（垃圾交易风险），请只确认你们自己提交的那笔（看 destination 和 data 是否正确）。

---

## 五、常见问题

| 问题 | 原因 / 处理 |
|---|---|
| 提交时报 `unknown custom error` | 某个 owner 钱包直接调了合约而不是走多签提交 —— 必须用多签的 `submitTransaction` / 面板多签区 |
| 面板「生成 calldata 错误」 | 函数名或参数个数不对。确认函数名 `withdrawToken`，参数正好 3 个逗号分隔 |
| 确认时找不到那笔交易 | 切钱包后**刷新页面**；确认 `_txId` 正确 |
| 交易显示已执行但钱没到账 | 检查 destination 是否填了 StakingDApp（填成多签地址会"假执行"）；检查收款地址 |
| 提取的是 XMRToken | 代币地址填 `0x6b4B901c5F41b843F91CAbF142738Af95690B2F8` |
| 想提手续费 | 用 `withdrawFees(收款地址, 金额wei)`，同样走多签 |

---

## 六、安全提醒

- 收款地址务必再三核对（转错无法追回）
- 多签 owner 私钥只保留在你自己手里，不要发给任何人
- 每次操作前核对：目标合约 `0xf5A3AA...`、多签 `0xa7ba6546...`
