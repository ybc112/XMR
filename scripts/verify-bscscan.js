// 直接通过 BscScan API 验证合约（绕过 hardhat-verify 的 TLS 问题）
// 用法: node scripts/verify-bscscan.js <合约名> <合约地址> [构造参数...]
// 示例:
//   node scripts/verify-bscscan.js XMRToken 0x6b4B901c5F41b843F91CAbF142738Af95690B2F8
//   node scripts/verify-bscscan.js StakingDApp 0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F 0x55d398326f99059fF775485246999027B3197955 0x6b4B901c5F41b843F91CAbF142738Af95690B2F8
//   node scripts/verify-bscscan.js MultiSigWallet 0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f '["0xC785D31F61234630E5632141cE4ed3d64C79aBC4","0xb1431c451ad866793e3fb1E3bE41C3E22883c518","0x8254fE8BA6F074704312bf1dB51c7C42e7E859cE"]' 2
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const { ethers } = require("ethers");

const API_KEY = process.env.BSCSCAN_API_KEY || "Y9SWA2SK9A2MUEBHGVR5Q4TSHQ3U4R5YES";
// Etherscan API V2（BscScan V1 已废弃）
const API_ENDPOINTS = [
  "https://api.etherscan.io/v2/api?chainid=56",
];
const PROVIDER = new ethers.JsonRpcProvider("https://bsc-dataseed.bnbchain.org");

async function getContractSource(contractName, contractPath) {
  const artifactFile = path.join(__dirname, "..", "artifacts", "contracts", contractPath, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactFile, "utf8"));

  // 读取源文件
  const sourceFile = path.join(__dirname, "..", "contracts", contractPath);
  const source = fs.readFileSync(sourceFile, "utf8");

  return { source, artifact, abi: JSON.stringify(artifact.abi) };
}

async function getMetadata(contractName) {
  const metaFile = path.join(__dirname, "..", "artifacts", "contracts", `${contractName}.sol`, `${contractName}.json`);
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  return meta.metadata;
}

async function verifyContract(contractName, address, constructorArgs) {
  console.log(`\n=== 验证 ${contractName} @ ${address} ===`);

  // 获取合约源文件路径映射
  const contractPaths = {
    "XMRToken": ["XMRToken.sol", "XMRToken.sol"],
    "StakingDApp": ["StakingDApp.sol", "StakingDApp.sol"],
    "MultiSigWallet": ["MultiSigWallet.sol", "MultiSigWallet.sol"],
    "MockUSDT": ["mock/MockUSDT.sol", "mock/MockUSDT.sol"],
  };
  const [sourceFile, artifactPath] = contractPaths[contractName] || [];

  if (!sourceFile) {
    console.error(`未知合约: ${contractName}`);
    return;
  }

  const { source, artifact } = await getContractSource(contractName, artifactPath);

  // 获取链上字节码
  const chainCode = await PROVIDER.getCode(address);
  console.log(`  链上代码长度: ${chainCode.length / 2 - 1} bytes`);

  // 编译本地字节码
  const localCode = artifact.deployedBytecode;
  console.log(`  本地字节码长度: ${localCode.length / 2 - 1} bytes`);

  // 比较（去掉 metadata 后 43 字节）
  const stripMeta = (hex) => {
    const b = hex.slice(2);
    if (b.length < 100) return hex;
    // solc metadata 在最后 2 字节标记长度，但 viaIR 可能不同
    // 尝试去掉最后 53 字节（43 bytes metadata + 2 bytes length + 8 bytes CBOR）
    return "0x" + b.slice(0, b.length - 106);
  };
  const chainStripped = stripMeta(chainCode.toLowerCase());
  const localStripped = stripMeta(localCode.toLowerCase());
  const match = chainStripped === localStripped;

  if (!match) {
    console.log(`  ⚠️ 字节码不匹配，检查前 64 字节:`);
    console.log(`  链上: ${chainStripped.slice(0, 66)}`);
    console.log(`  本地: ${localStripped.slice(0, 66)}`);
    // 继续尝试提交，hardhat 会处理精确匹配
  } else {
    console.log(`  ✅ 字节码匹配`);
  }

  // 读取源文件全部内容
  const sourceFullPath = path.join(__dirname, "..", "contracts", sourceFile);
  const sourceCode = fs.readFileSync(sourceFullPath, "utf8");

  // 读取依赖（OpenZeppelin + 本地文件）
  function collectImports(baseDir, code) {
    const imports = {};
    // 兼容 OZ5.x 的 `import {X} from "path"` 与 `import "path"` 两种语法
    const importRegex = /import\s+(?:[^"'\n]*?\s+from\s+)?["']([^"']+)["']/g;
    let m;
    while ((m = importRegex.exec(code)) !== null) {
      const impPath = m[1];
      let resolved;
      if (impPath.startsWith("@openzeppelin")) {
        resolved = path.join(__dirname, "..", "node_modules", impPath);
      } else if (impPath.startsWith(".")) {
        // 覆盖 ./ 与 ../ 相对路径（OZ 内部常用 ../utils/Context.sol）
        resolved = path.resolve(baseDir, impPath);
      } else {
        continue;
      }
      if (!fs.existsSync(resolved)) continue;
      const content = fs.readFileSync(resolved, "utf8");
      // key 规范化：OZ 依赖用 @openzeppelin/... 完整路径；本地依赖用相对 contracts/ 的路径。
      // 这样 import 语句（含 OZ 内部的相对 import，如 ./StorageSlot.sol）在 standard-json 里能正确解析。
      const nodeModulesIdx = resolved.indexOf("node_modules/");
      const key =
        nodeModulesIdx >= 0
          ? resolved.slice(nodeModulesIdx + "node_modules/".length)
          : path.relative(path.join(__dirname, "..", "contracts"), resolved);
      imports[key] = content;
      // 递归收集（OZ 内部相对 import 需继续解析）
      Object.assign(imports, collectImports(path.dirname(resolved), content));
    }
    return imports;
  }

  const dependencies = collectImports(path.dirname(sourceFullPath), sourceCode);

  // 构建 standard-json-input
  const sources = {};
  sources[sourceFile] = { content: sourceCode };
  for (const [impPath, content] of Object.entries(dependencies)) {
    sources[impPath] = { content };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "paris",
      metadata: { bytecodeHash: "ipfs" }
    }
  };

  // 编码构造参数
  let encodedArgs = "";
  if (constructorArgs && constructorArgs.length > 0) {
    try {
      const iface = new ethers.Interface(artifact.abi);
      encodedArgs = iface.encodeDeploy(constructorArgs).slice(2);
      console.log(`  构造参数: 0x${encodedArgs.slice(0, 40)}...`);
    } catch (e) {
      console.log(`  ⚠️ 编码构造参数失败: ${e.message}`);
    }
  }

  // 提交到 BscScan
  const formData = new URLSearchParams();
  formData.append("module", "contract");
  formData.append("action", "verifysourcecode");
  formData.append("contractaddress", address);
  formData.append("sourceCode", JSON.stringify(input));
  formData.append("codeformat", "solidity-standard-json-input");
  formData.append("contractname", `${contractName}.sol:${contractName}`);
  formData.append("compilerversion", "v0.8.20+commit.a1b79de6");
  formData.append("optimizationused", "1");
  formData.append("runs", "200");
  formData.append("constructorArguements", encodedArgs);
  formData.append("evmversion", "paris");
  formData.append("licenseType", "3"); // MIT
  formData.append("apikey", API_KEY);

  console.log(`  提交验证请求...`);

  async function submitToApi(apiUrl) {
    // 用 curl 子进程提交（node fetch/https 在本机网络环境被拦截，curl 可通）
    const { execFileSync } = require("child_process");
    const body = formData.toString();
    const tmpFile = `/tmp/verify-body-${Date.now()}.txt`;
    fs.writeFileSync(tmpFile, body);
    try {
      const out = execFileSync(
        "curl",
        ["-s", "-m", "30", "-X", "POST", apiUrl,
         "-H", "Content-Type: application/x-www-form-urlencoded",
         "--data-binary", `@${tmpFile}`],
        { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
      );
      try {
        return JSON.parse(out);
      } catch {
        return { status: "0", result: out };
      }
    } finally {
      fs.unlinkSync(tmpFile);
    }
  }

  let result = null;
  let lastErr = null;
  for (const endpoint of API_ENDPOINTS) {
    try {
      console.log(`  尝试端点: ${endpoint}`);
      result = await submitToApi(endpoint);
      break;
    } catch (e) {
      lastErr = e;
      console.log(`  ⚠️ ${endpoint} 失败: ${e.message}`);
    }
  }

  if (!result) {
    console.error(`  ❌ 所有端点均失败: ${lastErr?.message}`);
    return;
  }

  console.log(`  BscScan 响应:`, JSON.stringify(result, null, 2));

  if (result.status === "1") {
    console.log(`  ✅ ${contractName} 验证提交成功！`);
  } else {
    console.log(`  ⚠️ ${contractName} 验证结果: ${result.result}`);
  }
}

// 主函数
async function main() {
  const contractName = process.argv[2];
  const address = process.argv[3];
  const constructorArgs = process.argv.slice(4);

  if (!contractName || !address) {
    console.log("用法: node scripts/verify-bscscan.js <合约名> <合约地址> [构造参数...]");
    console.log("示例:");
    console.log("  node scripts/verify-bscscan.js XMRToken 0x6b4B901c5F41b843F91CAbF142738Af95690B2F8");
    console.log("  node scripts/verify-bscscan.js StakingDApp 0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F 0x55d398326f99059fF775485246999027B3197955 0x6b4B901c5F41b843F91CAbF142738Af95690B2F8");
    console.log("  node scripts/verify-bscscan.js MultiSigWallet 0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f 0xC785D31F61234630E5632141cE4ed3d64C79aBC4 0xb1431c451ad866793e3fb1E3bE41C3E22883c518 0x8254fE8BA6F074704312bf1dB51c7C42e7E859cE 2");
    process.exit(1);
  }

  await verifyContract(contractName, address, constructorArgs);
}

main().catch(e => console.error("错误:", e.message));