// 部署 RewardToken 到 BSC 测试网并添加 PancakeSwap V2 流动性
// 用法: node scripts/deploy-reward-token.js
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { ethers } = require("ethers");

// 单节点 + 断线重试（避免多节点轮询的 nonce 一致性问题）
class RetryProvider extends ethers.JsonRpcProvider {
  constructor(url) {
    super(url, undefined, { staticNetwork: true });
    this.maxRetries = 12;
  }
  async send(method, params) {
    let lastErr;
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await super.send(method, params);
      } catch (e) {
        lastErr = e;
        const msg = String(e.message || e.code || "");
        const retriable = e.code === "ETIMEDOUT" || e.code === "ECONNRESET" ||
          msg.includes("timeout") || msg.includes("detect network") || msg.includes("missing response");
        if (!retriable) throw e;
        const wait = Math.min(3000 * (i + 1), 12000);
        console.log(`  [retry] ${msg.split("\n")[0].slice(0, 50)}, ${wait / 1000}s 后重试 (${i + 1}/${this.maxRetries})`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }
}

// PancakeSwap V2 Router（BSC 测试网）
const ROUTER = "0xd99D1cB72861e652d34C52f38401aB33b469B226";
const ROUTER_ABI = [
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint,uint,uint)"
];

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.bnbchain.org";
  const provider = new RetryProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log("部署钱包:", wallet.address);
  console.log("tBNB 余额:", ethers.formatEther(balance));
  if (balance < ethers.parseEther("0.02")) {
    throw new Error(`tBNB 不足（需 ≥0.02，当前 ${ethers.formatEther(balance)}），请先到水龙头领取`);
  }

  // 1. 部署 RewardToken
  console.log("\n[1/3] 部署 RewardToken ...");
  const artifact = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "artifacts", "contracts", "mock", "RewardToken.sol", "RewardToken.json"), "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const reward = await factory.deploy();
  await reward.waitForDeployment();
  const token = await reward.getAddress();
  console.log("   REWARD 地址:", token);

  // 2. 授权 Router 使用 10000 枚
  console.log("[2/3] 授权 PancakeSwap Router ...");
  const tokenAmt = ethers.parseUnits("10000", 18);
  const approveTx = await reward.approve(ROUTER, tokenAmt);
  await approveTx.wait();
  console.log("   授权完成, tx:", approveTx.hash);

  // 3. 加池：10000 REWARD + 0.01 tBNB
  console.log("[3/3] 添加流动性 (10000 REWARD + 0.01 tBNB) ...");
  const router = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);
  const bnbAmt = ethers.parseEther("0.01");
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const liqTx = await router.addLiquidityETH(token, tokenAmt, 0, 0, wallet.address, deadline, { value: bnbAmt });
  const receipt = await liqTx.wait();
  console.log("   流动性已添加, tx:", liqTx.hash, "区块:", receipt.blockNumber);

  console.log("\n========================================");
  console.log("REWARD 代币地址（拿去平台填「分红合约」）:");
  console.log("  ", token);
  console.log("========================================");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("部署失败:", e.message.split("\n")[0]);
  process.exit(1);
});
