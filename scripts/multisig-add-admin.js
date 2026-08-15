// 多签添加管理员脚本：提交 addAdmin(地址) → 确认 → 执行
// 用法（私钥通过环境变量传入，避免留在历史记录）：
//   export PK1=<owner私钥> PK2=<另一个owner私钥> ADMIN_ADDRESS=<要加的管理员钱包>
//   node scripts/multisig-add-admin.js
//
// 流程：
//   owner1 提交 addAdmin → owner2 确认 → 自动执行（2/2）
// 完成后链上: 目标钱包成为 StakingDApp 管理员（可登录前端 Admin 页）

const { ethers } = require("ethers");

const STAKING = process.env.STAKING_ADDRESS || "0xdb29E9eB1149d33E0979285eacf56572fACA62C9";
const MULTISIG = process.env.MULTISIG_ADDRESS || "0xAEb8B096a717AeF05F169707968623C2c9F97650";
const RPC = process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.bnbchain.org";

const abi = [
  "function submitTransaction(address destination, uint256 value, bytes data) returns (uint256)",
  "function confirmTransaction(uint256 txId)",
  "function executeTransaction(uint256 txId)",
  "function transactionCount() view returns (uint256)"
];
const stakingAbi = [
  "function addAdmin(address)"
];

async function main() {
  const pk1 = process.env.PK1;
  const pk2 = process.env.PK2;
  const adminAddr = process.env.ADMIN_ADDRESS;
  if (!pk1 || !pk2 || !adminAddr) {
    console.error("用法: export PK1=<owner私钥> PK2=<另一个owner私钥> ADMIN_ADDRESS=<钱包地址> && node scripts/multisig-add-admin.js");
    process.exit(1);
  }
  if (!ethers.isAddress(adminAddr)) {
    console.error("ADMIN_ADDRESS 不是合法地址");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const w1 = new ethers.Wallet(pk1, provider);
  const w2 = new ethers.Wallet(pk2, provider);
  const multisig = new ethers.Contract(MULTISIG, abi, w1);
  const stakingIface = new ethers.Interface(stakingAbi);
  const data = stakingIface.encodeFunctionData("addAdmin", [adminAddr]);

  console.log("目标管理员:", adminAddr);
  console.log("签名者1:", w1.address, "签名者2:", w2.address);

  // 1. owner1 提交
  const txId = await multisig.submitTransaction.staticCall(STAKING, 0, data);
  const submitTx = await multisig.submitTransaction(STAKING, 0, data);
  await submitTx.wait();
  console.log("已提交 addAdmin, txId:", txId.toString(), "tx:", submitTx.hash);

  // 2. owner2 确认
  const confirmTx = await multisig.connect(w2).confirmTransaction(txId);
  await confirmTx.wait();
  console.log("owner2 已确认, tx:", confirmTx.hash);

  // 3. 执行（提交者自动算 1 签 + owner2 确认 = 2/2）
  const execTx = await multisig.executeTransaction(txId);
  const receipt = await execTx.wait();
  console.log("已执行, tx:", execTx.hash, "状态:", receipt.status === 1 ? "成功 ✅" : "失败 ❌");
}

main().catch((e) => { console.error("失败:", e.message.split("\n")[0]); process.exit(1); });
