// 从 hardhat build-info 生成 Etherscan 验证用的标准 JSON input
// 编译参数与部署时 100% 一致（版本/optimizer/viaIR/evmVersion 一字不差）
import fs from "fs";
import path from "path";

const biDir = "artifacts/build-info";
const biFiles = fs.readdirSync(biDir).filter((f) => f.endsWith(".json"));
if (biFiles.length === 0) throw new Error("无 build-info，先运行 npx hardhat compile");

const bi = JSON.parse(fs.readFileSync(path.join(biDir, biFiles[0]), "utf8"));
const solcVersion = "v" + bi.solcLongVersion;
fs.mkdirSync("work", { recursive: true });

const targets = ["MockUSDT", "XMRToken", "StakingDApp", "MultiSigWallet"];
const srcByContract = {};
for (const [srcPath, contracts] of Object.entries(bi.output.contracts)) {
  for (const name of Object.keys(contracts)) {
    if (targets.includes(name)) srcByContract[name] = srcPath;
  }
}

for (const name of targets) {
  if (!srcByContract[name]) {
    console.error(`警告: build-info 中找不到 ${name}`);
    continue;
  }
  const input = {
    language: "Solidity",
    sources: bi.input.sources,
    settings: bi.input.settings,
  };
  const outFile = `work/verify-input-${name}.json`;
  fs.writeFileSync(outFile, JSON.stringify(input));
  console.log(`${name} -> ${outFile}`);
  console.log(`  FQN: ${srcByContract[name]}:${name}`);
  console.log(`  solc: ${solcVersion} | input: ${JSON.stringify(input).length} bytes`);
}
