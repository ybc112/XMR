# 服务器运维指南（XMR 质押 DApp）

> 更新日期：2026-08-19 ｜ 适用服务器：`38.190.206.234`（新主服务器，旧服务器 `36.151.145.15` 已下线并删除代码）

---

## 一、服务器基本信息

| 项目 | 值 |
|---|---|
| 公网 IP | `38.190.206.234` |
| SSH 端口 | `54470` |
| 用户名 | `root` |
| 密码 | ⚠️ 见安全提醒（文档不记录密码） |
| 系统 | Ubuntu 22.04 LTS，Node v20.20.2，PM2 7.x，Nginx 1.18 |
| 项目目录 | `/opt/xmr-plan` |
| 域名 | `https://xmr-plan.com`（前端主页）、`https://xmr-plan.com/panel`（运营后台）、`https://www.xmr-plan.com` |
| HTTPS | Let's Encrypt 自动续期（certbot），无需人工处理 |

**架构**：Nginx（80/443，托管前端 + 反代 API）→ 后端 Node/Express（端口 3001，PM2 管理）→ BSC 主网合约。

---

## 二、日常操作

### 1. 连接服务器
```bash
ssh -p 54470 root@38.190.206.234
```

### 2. 查看后端状态 / 日志
```bash
pm2 ls                        # 进程列表（xmr-backend 应为 online）
pm2 logs xmr-backend          # 实时日志（Ctrl+C 退出）
pm2 logs xmr-backend --lines 50 --nostream   # 最近 50 行
```

关键日志关键字：
- `自动结算完成` —— 每天 12:01 自动结算成功（应每天出现一次）
- `自动结算失败` —— 结算失败，需排查
- `事件扫描失败` —— RPC 节点问题，多节点轮询会自动切换
- `扫描完成` —— 正常，lastScannedBlock 应随区块高度增长

### 3. 重启后端（部署更新后必做）
```bash
cd /opt/xmr-plan && git pull origin main    # 拉取最新代码
cd backend && npm install --omit=dev        # 有依赖变更时执行
pm2 restart xmr-backend                     # 重启（启动时会自动补结算）
```

### 4. 手动触发结算
- 运营后台 `https://xmr-plan.com/panel` → 设置 → 立即执行结算
- 或：`curl -X POST https://xmr-plan.com/api/admin/daily-settlement -H "admin-key: <你的ADMIN_API_KEY>"`

### 5. 手动更新 XMR 价格
- 运营后台 → 设置 → XMR 价格（管理员钱包直签）
- 每天 12:01 自动结算会自动写入实时价（Gate.io 永续合约源）

---

## 三、自动备份（已配置，无需手动）

**每天北京时间 12:30（UTC 04:30）自动备份**，由 cron 执行：

```
30 4 * * * /opt/xmr-plan/scripts/backup.sh >> /var/log/xmr-backup.log 2>&1
```

| 项目 | 说明 |
|---|---|
| 备份内容 | `backend/data/xmr.db`（事件缓存+管理员账号）和 `backend/.env`（配置+私钥） |
| 备份位置 | `/opt/xmr-plan/backups/`（如 `xmr.db.2026-08-19_043719`） |
| 保留策略 | 自动保留最近 14 天，超期自动清理 |
| 日志 | `/var/log/xmr-backup.log` |

### 手动备份 / 验证
```bash
/opt/xmr-plan/scripts/backup.sh          # 立即执行一次
ls -lt /opt/xmr-plan/backups/            # 查看备份文件
```

### 恢复数据库
```bash
pm2 stop xmr-backend
cp /opt/xmr-plan/backups/xmr.db.最新文件 /opt/xmr-plan/backend/data/xmr.db
pm2 restart xmr-backend
```

---

## 四、常见问题排查

| 现象 | 处理 |
|---|---|
| `自动结算失败: 403 / limit exceeded` | RPC 节点限流，已配置多节点自动切换（publicnode/dataseed×3/1rpc），等待下个周期或手动触发一次 |
| 首页 XMR 价格是 100 | 合约价格未写入。确认运营钱包是 admin 后，面板设置价格或等 12:01 自动结算 |
| 事件扫描停滞 | `pm2 logs xmr-backend --lines 30 --nostream` 看错误；RPC 问题会自动切换 |
| 面板操作报 `unknown custom error` | onlyOwner 操作（调余额/拉黑/费率/暂停）必须走多签：用 owner 钱包提交，2/3 确认 |
| 磁盘告警 | 检查 `/opt/xmr-plan/backups` 是否正常清理；`df -h /` |

---

## 五、合约地址速查（BSC 主网，2026-08-18 部署）

| 合约 | 地址 |
|---|---|
| StakingDApp | `0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F` |
| XMRToken | `0x6b4B901c5F41b843F91CAbF142738Af95690B2F8` |
| MultiSigWallet | `0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f` |
| USDT（BSC 官方） | `0x55d398326f99059fF775485246999027B3197955` |
| 运营钱包（admin） | `0x9163e6FD1767130b740fDc3Df120001b4dBf1177` |

结算规则：每 24 小时一个周期，周期边界 = 北京时间 12:00（合约 `SETTLEMENT_ANCHOR=1767240000`），后端 12:01 自动执行 `dailySettlement(实时价)`，静态收益 + 团队收益自动发放到 `pendingXMR`。

---

## 六、安全提醒

1. **SSH 密码**：文档未记录密码，请妥善保管；建议改为 SSH 密钥登录
2. **`backend/.env` 含 ADMIN_PRIVATE_KEY**（运营钱包私钥）：不要推送到 GitHub、不要外发；如泄露，新建钱包并通过多签重新 addAdmin 后替换
3. 运营后台账密在 `backend/.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`
4. 所有链上管理操作经多签（2/3 owner）执行，多签 owner 私钥只保留在你自己手中
5. GitHub Token：请定期轮换
