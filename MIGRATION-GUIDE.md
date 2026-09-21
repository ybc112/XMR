# 合约迁移操作规范（用户数据迁移）

> 整理日期：2026-09-21 ｜ 依据：2026-08/09 两次主网迁移的实操记录与链上合约实现
> **v6 更新**：迁移函数由旧版 `batchImportUsers`（单仓位合并）升级为 **`batchImportPositions`**（多仓位扁平化导入），下述流程以此为准
> 适用场景：合约重新部署后，把旧合约的用户数据迁移到新合约

***

## 一、迁移整体流程

```
① 导出数据        后端 SQLite 事件表 → old-users.csv（按用户聚合）
② 生成导入文件     old-users.csv → migration-import.json（7 个并行数组，仓位扁平化）
③ 分批             按每批 ≤100 拆分为 batch-N.json（建议 30~50 个/批）
④ 生成 calldata    每批编码 batchImportPositions(...) → batch-N-calldata.txt
⑤ 多签执行         2/3 owner 签名调用 batchImportPositions（onlyOwner，见第五节）
⑥ 校验             逐用户比对新旧合约数据，输出校验报告
⑦ 切换             后端 .env / 前端合约地址切换到新合约，重新构建部署（旧合约冻结入口）
```

***

## 二、数据导出（第 ① 步）

### 2.1 数据源

**后端 SQLite 事件表**（`backend/data/xmr.db` 的 `events` 表）—— 这是最可靠的来源，
因为它已经完整扫描了旧合约的全部历史事件（注册、投资、收益、提现）。

> 为什么不用链上直接查：公共 RPC 的 `eth_getLogs` 有区块范围限制，历史全量查询不稳定；
> 后端事件表是长期增量扫描积累的，完整性更好。

### 2.2 导出脚本

`backend/export-old-users.js`（在服务器 `/opt/xmr-plan/backend` 下运行）：

```bash
node export-old-users.js old-users.csv
```

脚本逻辑：遍历事件表，按 `userAddress` 聚合，产出每个用户的下列字段：

| CSV 字段                          | 来源事件                               | 聚合规则       |
| ------------------------------- | ---------------------------------- | ---------- |
| `memberId`                      | Registered                         | 取注册时的会员 ID |
| `referrer`                      | Registered                         | 推荐人地址（小写）  |
| `registerTime`                  | Registered                         | 注册时间戳      |
| `invested`                      | Invested                           | 累计投资额      |
| `staticUsdt`                    | StaticRewardClaimed                | 累计静态收益     |
| `genUsdt`                       | GenerationReward                   | 累计推荐奖      |
| `teamXmr`                       | TeamReward                         | 累计团队奖（XMR） |
| `usdtWithdrawn`                 | USDTWithdrawn                      | 累计已提现 USDT |
| `xmrRequested` / `xmrProcessed` | XMRWithdrawalRequested / Processed | 提现申请与处理记录  |
| `xmrAddr`                       | XMRAddressSet                      | 绑定的门罗收款地址  |

> 历史实操结果：`old-users.csv` 93 行（92 个用户 + 表头）。

***

## 三、导入数据结构（第 ② 步）

`migration-import.json` 的结构 —— **7 个并行数组，仓位扁平化**：

```json
{
  "users":          ["0xbe67...", "0x794a...", ...],      // 用户地址（不重复）
  "referrers":      ["0x0000...", "0xbe67...", ...],      // 每个用户的推荐人
  "userPosCounts":  [2, 1, 3, ...],                       // 每个用户的仓位数量
  "principals":     ["100000000000000000000", "50000000000000000000", ...],  // 扁平化：所有仓位本金依次排列
  "earneds":        ["0", "0", ...],                      // 扁平化：各仓位已赚（策略A=0；策略B=推演值）
  "pendingUSDTs":   ["0", ...],                           // 每个用户的待提 USDT
  "pendingXMRs":    ["0", ...]                            // 每个用户的待提 XMR
}
```

| 字段                 | 含义           | 单位        | 说明                                                                              |
| ------------------ | ------------ | --------- | ------------------------------------------------------------------------------- |
| `users`            | 用户地址         | —         | 全部小写，每个用户只出现一次                                                                  |
| `referrers`        | 推荐人地址        | —         | 无推荐人填 `0x000...0`；**推荐人必须先于该用户导入**（合约有 `require(users[referrer].isRegistered)`） |
| `userPosCounts[i]` | 第 i 个用户的仓位数量 | —         | ≥1 且 ≤20；`用户的 N 个仓位 = principals 中接下 N 个元素`                                     |
| `principals`       | 所有仓位本金（扁平化）  | wei（1e18） | 长度必须 == `Σ userPosCounts`；顺序：用户 1 的仓位 → 用户 2 的仓位 → …                            |
| `earneds`          | 各仓位已赚（扁平化）   | wei       | 与 `principals` 一一对应；策略 A（进度重置）全填 0；策略 B 填推演值                                    |
| `pendingUSDTs`     | 待提 USDT 余额   | wei       | 未提取的 USDT 收益                                                                    |
| `pendingXMRs`      | 待提 XMR 余额    | wei       | 未提取的 XMR 收益，合约会 mint 铸造                                                         |

⚠️ **数组顺序必须保持一致** —— 合约按下标一一对应读取。
⚠️ **`principals`** **/** **`earneds`** **为扁平化编码**（合约不支嵌套动态数组）：先填用户 1 的 `userPosCounts[0]` 个仓位，再填用户 2 的，以此类推。
⚠️ **推荐人顺序要求**：因为导入时会校验 `推荐人已注册`，所以数据必须
**按推荐关系拓扑排序**（上级在前、下级在后），否则会 revert。

***

## 四、分批规范（第 ③ 步）

| 项目    | 规范                                                                                      |
| ----- | --------------------------------------------------------------------------------------- |
| 合约硬限制 | **每批 ≤ 100 个用户**（`require(n > 0 && n <= 100, "Batch must be 1-100 users")`）；单用户 ≤ 20 仓位 |
| 历史实操  | 3 批 × 30 个（90 用户）                                                                       |
| 分批建议  | **20\~50 个/批**（多仓位 + 团队业绩重算 gas 更高，宁小勿大）                                                |
| 批次文件  | `migration/batches/batch-N.json` + `batch-N-calldata.txt`                               |

**注意**：每批内部的用户也要保持「推荐人在前」的顺序；跨批次时，先导上级批次。

***

## 五、合约端行为（第 ⑤ 步，`batchImportPositions` 逐条说明）

```solidity
function batchImportPositions(
    address[] calldata _users,          // 用户地址（每用户一次）
    address[] calldata _referrers,      // 推荐人（每用户一个）
    uint256[] calldata _userPosCounts,  // 每用户仓位数量
    uint256[] calldata _principals,     // 扁平化：所有仓位本金
    uint256[] calldata _earneds,        // 扁平化：各仓位已赚（策略A=0）
    uint256[] calldata _pendingUSDTs,   // 每用户待提 USDT
    uint256[] calldata _pendingXMRs     // 每用户待提 XMR
) external onlyOwner
```

对每个用户依次执行：

| 步骤 | 行为          | 说明                                                                                                                                                                      |
| -- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | 若未注册 → 完整注册 | `_importRegister`：设置 `referrer`、`registerTime = 迁移时刻`、`lastClaimDay = 当前周期`、随机分配 `memberId`（**与旧合约不同**）、加入 `userList`；已注册则校验 referrer 一致性                               |
| 2  | 建立推荐关系      | `directReferrals[上级].push(用户)`；`_importRegister` 内部已有 `require(推荐人已注册)`                                                                                                 |
| 3  | 生成 N 个独立仓位  | 按 `_userPosCounts[i]` 依次从 `_principals`/`_earneds` 取 `principal`/`earned`，`push` 进 `positions[user]`（`lastClaimPeriod=迁移时刻`，`closed = earned >= principal × 3` 时置 true） |
| 4  | 账号出局额度      | `exitLimit = personalAmount × 3`（`personalAmount` = Σ 各仓位本金）                                                                                                            |
| 5  | 团队业绩与等级重算   | `_updateTeamVolumesAndLevels` + `_checkAndSetLevel`                                                                                                                     |
| 6  | 导入待提余额      | `pendingUSDT += ...`；`pendingXMR` 需先 `mint` 再累加                                                                                                                         |
| 7  | 出局判定        | `_checkAccountExit`：所有仓位 closed → `exited=true`                                                                                                                         |

### ⚠️ 关键特性：**收益进度重置**

导入**不包含** `totalEarned`，因此：

| 字段                          | 迁移后的值                  |
| --------------------------- | ---------------------- |
| `totalEarned`（出局进度）         | **归零** —— 用户重新开始 3 倍周期 |
| `lastClaimDay`（结算周期）        | 迁移当时的周期                |
| `registerTime`（注册时间）        | 迁移时刻（历史注册时间不保留）        |
| `memberId`（会员 ID）           | **重新随机分配**（与旧合约不一致）    |
| `level` / `teamTotalVolume` | 由本金与团队关系**自动重算**       |

> 这是有意设计：迁移后每个用户都拥有完整的 3 倍额度空间。

***

## 六、calldata 生成与执行（第 ④⑤ 步）

- 每批用 `ethers.Interface.encodeFunctionData("batchImportPositions", [users, referrers, userPosCounts, principals, earneds, pendingUSDTs, pendingXMRs])` 编码

- 选择器：**`0x62884b59`**

- 输出到 `batch-N-calldata.txt`（单行超长字符串）

- 由多签 owner 提交：`submitTransaction(destination=新合约, value=0, data=calldata)` → 2/3 确认 → 执行

***

## 七、迁移后校验（第 ⑥ 步）

必须逐项比对，全部通过才切换前端/后端地址：

| 校验项       | 要求                                                             |
| --------- | -------------------------------------------------------------- |
| 用户数量      | 新合约 `getUserCount()` == 应迁移用户数                                 |
| **仓位数量**  | 每用户 `getPositionCount()` == 导出 `userPosCounts`                 |
| **各仓位本金** | `getPositionInfo(user, i).principal` 与导出扁平化 `principals` 一致    |
| **各仓位已赚** | `getPositionInfo(user, i).earned` 与 `earneds`（策略 B）一致；策略 A 为 0 |
| **出局进度**  | 3 倍封顶仓位 `closed=true`，账号 `exited` 状态与重算一致                      |
| 每个用户待提余额  | `pendingUSDT` / `pendingXMR` 一致                                |
| 推荐关系      | `getDirectReferrals()` 与旧合约拓扑一致                                |
| 团队业绩      | `teamTotalVolume` 与重算值一致                                       |
| 等级        | `level` 与本金/团队业绩推导值一致                                          |
| 特殊用户      | 补投用户（多仓位）、被拉黑用户、已出局用户单独抽查                                      |

> 建议输出**逐用户校验报告**（CSV），不一致项列入人工复核清单。

***

## 八、历史迁移记录

| 时间            | 场景                    | 规模                 | 结果                                         |
| ------------- | --------------------- | ------------------ | ------------------------------------------ |
| 2026-08-29    | 主网首个版本 → 规则升级版        | 90 用户（3 批 × 30）    | calldata 生成并执行，材料存于 `migration/`           |
| 2026-09（19 前） | 迁移到现网合约 `0x7647bF...` | 覆盖当时全部用户           | 前端/后端切换完成，后续用户数增长至 204                     |
| 2026-09-20    | 本次发现的补投用户             | 2 个用户有 2 笔投资       | 见 MULTI-POSITION-DESIGN.md 第 7.3 节         |
| 2026-09-21    | **主网 v6 多仓位升级（计划）**   | 主网单仓位合约 → v6 多仓位合约 | 按本指南流程：导出 → batchImportPositions → 校验 → 切换 |

***

## 九、对「多仓位改造」的迁移方案（v6 已内置）

v6 合约已内置新的迁移函数 **`batchImportPositions`**（见第五节），替换旧版 `batchImportUsers`。
关键差异：

1. **数据结构升级**：5 数组 → 7 数组（新增 `userPosCounts`、扁平化 `principals`/`earneds`），一个用户可导入 N 个独立仓位
2. **旧合约单仓位用户**：`userPosCounts = 1`，`principal` = 合并后本金，`earned` 按策略填 0 或保留
3. **补投用户拆分**：旧合约（单仓位）没有仓位概念——按「投资笔数」或 `MULTI-POSITION-DESIGN.md` 第 7.3 节算法拆成多个仓位，每个仓位各自本金
4. **进度策略（需业务方确认）**：

| 策略                     | 做法                                                        | 影响                       |
| ---------------------- | --------------------------------------------------------- | ------------------------ |
| **A. 延续「进度重置」**（与历史一致） | 各仓位 `earned = 0`，全部重新开始 3 倍周期                             | 迁移简单，用户额度空间完整；但与旧合约进度不连续 |
| **B. 保留进度**            | 按 `MULTI-POSITION-DESIGN.md` 第 7.3 节的「事件重放」算法推演各仓位 earned | 用户进度连续，但需精确推演 + 逐用户校验    |

> 补投用户的拆分（按投资笔数生成多个仓位）在两种策略下都要做，
> 区别只在 `earned` 填 0 还是填推演值。
> **注意**：`_importRegister` 未保留旧合约的 `memberId`（重新随机分配）；依赖会员号的外部系统需提前预案。

***

## 十、迁移风险清单

| 风险          | 说明                   | 应对                          |
| ----------- | -------------------- | --------------------------- |
| 推荐人顺序错误     | 上级未先导入 → 整批 revert   | 数据按推荐拓扑排序，批次间也保持顺序          |
| 批次过大        | gas 超限导致交易失败         | 每批 50\~100 人，先小批试跑          |
| 补投用户漏拆      | 迁移后本金合并，重新出现「加速」问题   | 用导出脚本识别多笔投资用户，单独生成多仓位       |
| 进度重置引起用户疑问  | 用户的"累计收益"归零          | 提前准备客服话术；或采用策略 B 保留进度       |
| memberId 变化 | 会员 ID 重新分配，与旧号不一致    | 迁移前公告；如需保留需在导入函数中增加该字段      |
| 待提 XMR 铸造   | 迁移会 mint 等量 XMRToken | 确认 XMRToken 的 minter 已指向新合约 |
| 多签执行中断      | 迁移分多笔交易，中途失败         | 每批独立执行 + 记录已执行批次，支持断点续传     |

***

## 十一、迁移检查清单（执行前逐项确认）

- [ ] 新合约已部署并验证（BscScan 开源）

- [ ] 新合约所有权已转多签，且 admin 已配置

- [ ] XMRToken 的 minter 指向新 StakingDApp

- [ ] 后端事件表已同步到最新（扫描进度追上链顶）

- [ ] 导出数据已人工抽查（至少 5 个用户，含补投/拉黑/出局等特殊用户）

- [ ] 分批文件已生成，每批 ≤ 上限，推荐人顺序正确

- [ ] 小批试跑（首批 5\~10 人）验证 gas 与结果

- [ ] 全量执行完成，逐用户校验报告通过

- [ ] 后端 `.env` 合约地址切换 + 重启

- [ ] 前端合约地址切换 + 重新构建部署

- [ ] 旧合约保留只读（便于历史核对）

