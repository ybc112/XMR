// 多签阈值修改脚本：required 2 → 3（3 个 owner 保持不变）
// 原理：当前阈值=2，只需 2 个钱包签名即可自动执行
//
// 用法（私钥通过环境变量传入，避免留在历史记录）：
//   export PK1=<任意owner私钥> PK2=<另一个owner私钥>
//   node scripts/multisig-setup.js
//
// 流程：
//   owner1 提交 changeRequirement(3) → owner2 确认 → 自动执行（2/2）
// 完成后链上: 3 owners, required=3

const { ethers } = require("ethers");

const MULTISIG = "0x0E51A79183e701F4a35cD1Cc2655BE35c0e3f0b5";
const TARGET_REQUIRED = 3;

// 内嵌 ABI（不依赖本地 artifacts，任何装有 ethers 的目录都能跑）
const abi = [
  "function submitTransaction(address destination, uint256 value, bytes data) returns (uint256)",
  "function confirmTransaction(uint256 txId)",
  "function changeRequirement(uint256 _required)",
  "function isOwner(address) view returns (bool)",
  "function getOwners() view returns (address[])",
  "function required() view returns (uint256)",
  "function transactionCount() view returns (uint256)"
];

async function main() {
  const pk1 = process.env.PK1;
  const pk2 = process.env.PK2;
  if (!pk1 || !pk2) {
    console.error("用法: export PK1=<owner私钥> PK2=<另一个owner私钥> && node scripts/multisig-setup.js");
    console.error("PK1/PK2 必须是当前多签的任意 2 个不同 owner 私钥");
    process.exit(1);
  }

  const rpc = process.env.BSC_RPC_URL || "https://1rpc.io/bnb";
  const provider = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });
  const w1 = new ethers.Wallet(pk1, provider);
  const w2 = new ethers.Wallet(pk2, provider);
  console.log("owner1 (提交):", w1.address);
  console.log("owner2 (确认):", w2.address);

  const multisig = new ethers.Contract(MULTISIG, abi, w1);

  // 校验身份
  const [o1, o2] = await Promise.all([multisig.isOwner(w1.address), multisig.isOwner(w2.address)]);
  if (!o1) throw new Error(`PK1 对应地址 ${w1.address} 不是多签 owner`);
  if (!o2) throw new Error(`PK2 对应地址 ${w2.address} 不是多签 owner`);
  if (w1.address.toLowerCase() === w2.address.toLowerCase()) throw new Error("两个私钥不能是同一个钱包");

  // 当前状态
  const owners = await multisig.getOwners();
  const required = (await multisig.required()).toString();
  console.log(`\n当前状态: owners=${owners.length} (${owners.map(a => a.slice(0, 8)).join(", ")}...), required=${required}`);
  if (required !== "2") {
    console.warn(`警告: required=${required}，本脚本按 required=2 设计。`);
  }
  if (required === TARGET_REQUIRED.toString()) {
    console.log(`required 已是 ${TARGET_REQUIRED}，无需操作`);
    return;
  }

  const wait = async (tx, label) => {
    console.log(`  ${label}: ${tx.hash}`);
    const rc = await tx.wait();
    if (rc.status !== 1) throw new Error(`${label} 失败`);
    return rc;
  };

  console.log(`\n[1/2] owner1 提交 changeRequirement(${TARGET_REQUIRED}) ...`);
  const data = multisig.interface.encodeFunctionData("changeRequirement", [TARGET_REQUIRED]);
  const tx = await multisig.submitTransaction(MULTISIG, 0, data, { gasLimit: 300000 });
  await wait(tx, "提交 changeRequirement");
  const txId = (await multisig.transactionCount()) - 1n;
  console.log(`    交易ID: ${txId}, 确认数: 1/2`);

  console.log(`[2/2] owner2 确认交易 #${txId} ...`);
  const tx2 = await w2.sendTransaction({
    to: MULTISIG,
    data: multisig.interface.encodeFunctionData("confirmTransaction", [txId]),
    gasLimit: 200000
  });
  await wait(tx2, "确认 changeRequirement");
  console.log("    确认数 2/2 → 自动执行，阈值修改完成");

  // 最终验证
  const finalOwners = await multisig.getOwners();
  const finalRequired = (await multisig.required()).toString();
  console.log("\n========== 最终状态 ==========");
  console.log("owners:", finalOwners.length);
  finalOwners.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  console.log("required:", finalRequired);
  console.log("多签地址:", MULTISIG);
  if (finalOwners.length === 3 && finalRequired === "3") {
    console.log("\n✅ 配置完成: 3 owners / 3 签名确认");
  } else {
    console.log("\n⚠️ 状态与目标不符，请检查链上交易");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error("失败:", e.message); process.exit(1); });
