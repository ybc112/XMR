// 生产部署脚本（带 RPC 断线重试 + 进度持久化，可安全重跑）
// 用法: node scripts/deploy-live.js
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { ethers } = require("ethers");

const STATE_FILE = path.join(__dirname, "..", "deploy-state.json");
const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";
const MULTISIG_OWNERS = (process.env.MULTISIG_OWNERS || "").split(",").map(s => s.trim()).filter(Boolean);
const MULTISIG_REQUIRED = parseInt(process.env.MULTISIG_REQUIRED || "2", 10);

// ---- RPC 多节点轮询 + 断线/限流自动重试 ----
class MultiRpcProvider extends ethers.JsonRpcProvider {
  constructor(urls) {
    super(urls[0], undefined, { staticNetwork: true });
    this.urls = urls;
    this.urlIdx = 0;
    this.maxRetries = 20;
  }
  _getConnection() {
    const conn = super._getConnection();
    conn.url = this.urls[this.urlIdx % this.urls.length];
    return conn;
  }
  async send(method, params) {
    let lastErr;
    for (let i = 0; i < this.maxRetries; i++) {
      this.urlIdx++; // 每次尝试换一个节点
      try {
        return await super.send(method, params);
      } catch (e) {
        lastErr = e;
        const msg = String(e.message || e.code || "");
        const retriable = e.code === "ETIMEDOUT" || e.code === "ECONNRESET" ||
          msg.includes("timeout") || msg.includes("detect network") ||
          msg.includes("missing response") || msg.includes("rate limit") || msg.includes("429");
        if (!retriable) throw e;
        const wait = Math.min(3000 * (i + 1), 15000);
        console.log(`  [retry] RPC 失败 (${msg.split("\n")[0].slice(0, 70)}), ${wait / 1000}s 后换节点重试 (${i + 1}/${this.maxRetries})`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }
}

// ---- 进度持久化 ----
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---- 从 artifacts 读 ABI ----
function getContract(solName, jsonName) {
  const p = path.join(__dirname, "..", "artifacts", "contracts", solName, jsonName + ".json");
  return JSON.parse(fs.readFileSync(p, "utf8")).abi;
}

async function main() {
  if (MULTISIG_OWNERS.length < MULTISIG_REQUIRED) {
    throw new Error(`多签配置无效: owners=${MULTISIG_OWNERS.length} 个, required=${MULTISIG_REQUIRED}, required 必须 ≤ owners`);
  }

  const rpcUrls = (process.env.BSC_RPC_URL || "https://bsc.drpc.org")
    .split(",").map(s => s.trim()).filter(Boolean);
  rpcUrls.push("https://bsc.drpc.org", "https://1rpc.io/bnb", "https://bsc.publicnode.com/");
  const provider = new MultiRpcProvider([...new Set(rpcUrls)]);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const state = loadState();

  console.log("部署账户:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("账户余额:", ethers.formatEther(balance), "BNB");
  const fee = (await provider.getFeeData()).gasPrice;
  console.log("当前 gasPrice:", ethers.formatUnits(fee, "gwei"), "gwei");

  const xmrAbi = getContract("XMRToken.sol", "XMRToken");
  const stakingAbi = getContract("StakingDApp.sol", "StakingDApp");
  const multisigAbi = getContract("MultiSigWallet.sol", "MultiSigWallet");

  // 1. XMRToken
  if (!state.xmrToken) {
    console.log("\n[1/6] 部署 XMRToken ...");
    const xmrArtifact = JSON.parse(fs.readFileSync(
      path.join(__dirname, "..", "artifacts", "contracts", "XMRToken.sol", "XMRToken.json"), "utf8"));
    const factory = new ethers.ContractFactory(xmrAbi, xmrArtifact.bytecode, wallet);
    const c = await factory.deploy();
    await c.waitForDeployment();
    state.xmrToken = await c.getAddress();
    saveState(state);
    console.log("   XMRToken:", state.xmrToken);
  } else {
    console.log("\n[1/6] XMRToken 已部署，跳过:", state.xmrToken);
  }

  // 2. StakingDApp
  if (!state.stakingDApp) {
    console.log("[2/6] 部署 StakingDApp (USDT:", USDT_ADDRESS, ") ...");
    const artifact = JSON.parse(fs.readFileSync(
      path.join(__dirname, "..", "artifacts", "contracts", "StakingDApp.sol", "StakingDApp.json"), "utf8"));
    const factory = new ethers.ContractFactory(stakingAbi, artifact.bytecode, wallet);
    const c = await factory.deploy(USDT_ADDRESS, state.xmrToken);
    await c.waitForDeployment();
    state.stakingDApp = await c.getAddress();
    saveState(state);
    console.log("   StakingDApp:", state.stakingDApp);
  } else {
    console.log("[2/6] StakingDApp 已部署，跳过:", state.stakingDApp);
  }

  // 3. setMinter
  if (!state.minterSet) {
    console.log("[3/6] 设置 XMRToken minter 为 StakingDApp ...");
    const xmr = new ethers.Contract(state.xmrToken, xmrAbi, wallet);
    const tx = await xmr.setMinter(state.stakingDApp);
    await tx.wait();
    state.minterSet = true;
    saveState(state);
    console.log("   minter 已设置");
  } else {
    console.log("[3/6] minter 已设置，跳过");
  }

  // 4. MultiSigWallet
  if (!state.multiSig) {
    console.log(`[4/6] 部署 MultiSigWallet (owners=${MULTISIG_OWNERS.length}, required=${MULTISIG_REQUIRED}) ...`);
    const artifact = JSON.parse(fs.readFileSync(
      path.join(__dirname, "..", "artifacts", "contracts", "MultiSigWallet.sol", "MultiSigWallet.json"), "utf8"));
    const factory = new ethers.ContractFactory(multisigAbi, artifact.bytecode, wallet);
    const c = await factory.deploy(MULTISIG_OWNERS, MULTISIG_REQUIRED);
    await c.waitForDeployment();
    state.multiSig = await c.getAddress();
    state.owners = MULTISIG_OWNERS;
    state.required = MULTISIG_REQUIRED;
    saveState(state);
    console.log("   MultiSigWallet:", state.multiSig);
  } else {
    console.log("[4/6] MultiSigWallet 已部署，跳过:", state.multiSig);
  }

  // 5. transferOwnership (StakingDApp)
  if (!state.ownershipStaking) {
    console.log("[5/6] StakingDApp 所有权转给多签 ...");
    const staking = new ethers.Contract(state.stakingDApp, stakingAbi, wallet);
    const tx = await staking.transferOwnership(state.multiSig);
    await tx.wait();
    state.ownershipStaking = true;
    saveState(state);
  } else {
    console.log("[5/6] StakingDApp 所有权已转，跳过");
  }

  // 6. transferOwnership (XMRToken)
  if (!state.ownershipXmr) {
    console.log("[6/6] XMRToken 所有权转给多签 ...");
    const xmr = new ethers.Contract(state.xmrToken, xmrAbi, wallet);
    const tx = await xmr.transferOwnership(state.multiSig);
    await tx.wait();
    state.ownershipXmr = true;
    saveState(state);
  } else {
    console.log("[6/6] XMRToken 所有权已转，跳过");
  }

  // 验证链上代码存在
  for (const [name, addr] of [["XMRToken", state.xmrToken], ["StakingDApp", state.stakingDApp], ["MultiSigWallet", state.multiSig]]) {
    const code = await provider.getCode(addr);
    if (code === "0x" || code.length < 10) throw new Error(`验证失败: ${name} (${addr}) 链上无代码`);
    console.log(`   验证通过: ${name} @ ${addr}`);
  }

  console.log("\n========== 部署完成 ==========");
  console.log("XMRToken:       ", state.xmrToken);
  console.log("StakingDApp:    ", state.stakingDApp);
  console.log("MultiSigWallet: ", state.multiSig);
  console.log("Owners:         ", state.owners.join(", "));
  console.log("Required:       ", state.required);
  console.log("USDT:           ", USDT_ADDRESS);
  console.log("=================================");
  console.log("\n后续步骤:");
  console.log("1. 多签提交 addAdmin(管理员地址) 并凑齐签名");
  console.log("2. 多签提交 dailySettlement(xmrPrice) 设置 XMR 价格");
  console.log("3. BscScan 验证合约");
  console.log("4. 更新 frontend/src/config/contracts.js 和 backend/.env");
}

main().then(() => process.exit(0)).catch(e => { console.error("部署失败:", e.message); process.exit(1); });
