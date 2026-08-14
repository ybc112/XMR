// 诊断脚本：复刻 hardhat-verify 的字节码匹配逻辑
// 用法: node scripts/verify-diag.js <合约地址>
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// solc metadata 在字节码末尾，最后 2 字节为 metadata 长度（小端）
function stripMetadata(hexCode) {
  if (!hexCode || hexCode === "0x" || hexCode.length < 10) return hexCode;
  const bytes = hexCode.slice(2);
  if (bytes.length % 2 !== 0) return hexCode;
  const len = parseInt(bytes.slice(-4), 16);
  if (Number.isFinite(len) && len > 0 && len < 0x10000) {
    const start = bytes.length / 2 - 2 - len;
    if (start > 0) return "0x" + bytes.slice(0, start * 2);
  }
  return hexCode;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".json") ? [path.join(dir, e.name)] : []
  );
}

(async () => {
  const addr = process.argv[2];
  if (!addr) { console.error("用法: node scripts/verify-diag.js <address>"); process.exit(1); }
  const provider = new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet.bnbchain.org");
  const chain = await provider.getCode(addr);
  console.log("chain code len:", chain.length / 2 - 1, "bytes");
  console.log("chain sha256:", crypto.createHash("sha256").update(chain).digest("hex"));

  let matched = 0;
  for (const f of walk("artifacts/contracts")) {
    const a = JSON.parse(fs.readFileSync(f, "utf8"));
    if (!a.deployedBytecode || a.deployedBytecode === "0x") continue;
    const exact = chain.toLowerCase() === a.deployedBytecode.toLowerCase();
    const stripped = stripMetadata(chain.toLowerCase()) === stripMetadata(a.deployedBytecode.toLowerCase());
    if (exact || stripped) {
      matched++;
      console.log("MATCH:", f, exact ? "(exact)" : "(仅 strip metadata 后一致)");
    }
  }
  console.log("匹配的 artifact 数:", matched);
  console.log("chain 去掉 metadata 前 60 字节:", stripMetadata(chain).slice(0, 60));
  process.exit(matched > 0 ? 0 : 1);
})().catch((e) => { console.error("ERR", e.message.split("\n")[0]); process.exit(1); });
