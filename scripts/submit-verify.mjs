// 提交合约源码验证到 Etherscan V2 API（BSC 测试网 chainid=97）
// 用法: node scripts/submit-verify.mjs <input.json> <合约地址> <FQN> <solcVersion>
// 例如: node scripts/submit-verify.mjs work/verify-input-MockUSDT.json 0xE842... contracts/mock/MockUSDT.sol:MockUSDT v0.8.20+commit.a1b79de6
import fs from "fs";

const CHAIN_ID = 97; // BSC 测试网
const API = `https://api.etherscan.io/v2/api?chainid=${CHAIN_ID}`;

async function main() {
  const [inputFile, address, fqn, solcVersion] = process.argv.slice(2);
  if (!inputFile || !address || !fqn || !solcVersion) {
    console.error("用法: node scripts/submit-verify.mjs <input.json> <address> <FQN> <solcVersion>");
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(inputFile, "utf8"));

  // 有构造参数的合约不传 constructorArguements —— Etherscan 会从部署交易自动提取
  const body = new URLSearchParams({
    module: "contract",
    action: "verifysourcecode",
    apikey: process.env.BSCSCAN_API_KEY,
    contractaddress: address,
    sourceCode: JSON.stringify(input),
    codeformat: "solidity-standard-json-input",
    contractname: fqn,
    compilerversion: solcVersion,
    optimizationUsed: "1",
    runs: "200",
    licenseType: "3", // MIT
  });

  console.log(`提交验证: ${fqn} @ ${address} (${solcVersion})`);
  const res = await fetch(API, { method: "POST", body });
  const data = await res.json();
  console.log("提交响应:", data.status, "|", data.message, "|", data.result);

  if (data.status !== "1") {
    // 已验证过的合约返回 "Contract source code already verified"，视为成功（幂等）
    if (String(data.result).includes("already verified")) {
      console.log("✅ 该合约此前已验证，跳过");
      process.exit(0);
    }
    console.error("❌ 提交失败:", JSON.stringify(data));
    process.exit(1);
  }

  const guid = data.result;
  for (let i = 1; i <= 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const url = `${API}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${process.env.BSCSCAN_API_KEY}`;
    const sr = await (await fetch(url)).json();
    const result = String(sr.result || "");
    console.log(`  轮询 ${i}/24: ${result}`);
    // "Pass - Verified" 与 "Already Verified"（Etherscan 对已完成验证合约的轮询响应）都视为成功
    if (result.startsWith("Pass") || result.includes("Already Verified")) {
      console.log("✅ 验证通过");
      process.exit(0);
    }
    if (result.startsWith("Fail")) {
      console.error("❌ 验证失败:", result);
      process.exit(1);
    }
  }
  console.error("超时未返回结果，请到 BscScan 页面查看");
  process.exit(1);
}

main().catch((e) => { console.error("ERR", e.message.split("\n")[0]); process.exit(1); });
