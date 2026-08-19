// 生成 BscScan 验证用的 standard-json-input 文件
// 同时在区块链浏览器上输出验证链接，用户可直接打开粘贴
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const PROVIDER = new ethers.JsonRpcProvider("https://bsc-dataseed.bnbchain.org");

function collectImports(baseDir, code) {
  const imports = {};
  const importRegex = /import\s+["'](.+?)["']/g;
  let m;
  while ((m = importRegex.exec(code)) !== null) {
    const impPath = m[1];
    let resolved;
    if (impPath.startsWith("@openzeppelin")) {
      resolved = path.join(__dirname, "..", "node_modules", impPath);
    } else if (impPath.startsWith("./")) {
      resolved = path.join(baseDir, impPath);
    } else {
      continue;
    }
    if (fs.existsSync(resolved)) {
      const content = fs.readFileSync(resolved, "utf8");
      imports[impPath] = content;
      Object.assign(imports, collectImports(path.dirname(resolved), content));
    }
  }
  return imports;
}

async function main() {
  const entries = [
    {
      name: "XMRToken",
      address: "0x6b4B901c5F41b843F91CAbF142738Af95690B2F8",
      file: "XMRToken.sol",
      constructorArgs: [],
    },
    {
      name: "StakingDApp",
      address: "0xf5A3AA050958Ffb8B2bd2b65c12e3c05CF13F76F",
      file: "StakingDApp.sol",
      constructorArgs: [
        "0x55d398326f99059fF775485246999027B3197955",
        "0x6b4B901c5F41b843F91CAbF142738Af95690B2F8",
      ],
    },
    {
      name: "MultiSigWallet",
      address: "0xa7ba6546F1B43524413b2D938D2a3C0b2C37016f",
      file: "MultiSigWallet.sol",
      constructorArgs: [
        [
          "0xC785D31F61234630E5632141cE4ed3d64C79aBC4",
          "0xb1431c451ad866793e3fb1E3bE41C3E22883c518",
          "0x8254fE8BA6F074704312bf1dB51c7C42e7E859cE",
        ],
        2,
      ],
    },
  ];

  for (const entry of entries) {
    const sourceFullPath = path.join(__dirname, "..", "contracts", entry.file);
    const sourceCode = fs.readFileSync(sourceFullPath, "utf8");
    const dependencies = collectImports(path.dirname(sourceFullPath), sourceCode);

    const sources = {};
    sources[entry.file] = { content: sourceCode };
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
        metadata: { bytecodeHash: "ipfs" },
      },
    };

    const outputFile = path.join(__dirname, "..", "work", `verify-${entry.name}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(input, null, 2));

    // 编码构造参数
    const artifactFile = path.join(
      __dirname, "..", "artifacts", "contracts", `${entry.name}.sol`, `${entry.name}.json`
    );
    const artifact = JSON.parse(fs.readFileSync(artifactFile, "utf8"));
    const iface = new ethers.Interface(artifact.abi);
    const encodedArgs = entry.constructorArgs.length > 0
      ? iface.encodeDeploy(entry.constructorArgs).slice(2)
      : "";

    console.log(`\n=== ${entry.name} ===`);
    console.log(`地址: ${entry.address}`);
    console.log(`BscScan 验证链接: https://bscscan.com/verifyContract?a=${entry.address}`);
    console.log(`本地 JSON 文件: ${outputFile}`);
    console.log(`构造参数 (ABI-encoded): 0x${encodedArgs}`);
    console.log(`编译器版本: v0.8.20+commit.a1b79de6`);
    console.log(`优化: 启用, runs=200`);
    console.log(`EVM: paris`);
    console.log(`许可证: MIT`);
    console.log(`--- 在 BscScan 上选择 "Solidity (Standard JSON Input)" ---`);
  }
}

main().catch((e) => console.error("错误:", e.message));