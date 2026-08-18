const { ethers } = require("ethers");
const p = new ethers.JsonRpcProvider("https://bsc-testnet.publicnode.com");
const staking = "0x2a74f3dEA47640e5cBEbfCb69E61A82c628327B0";
const ms = "0xeee8415C2F13FF7C39f51Ba0cf81794878F06Fb0";
const c = new ethers.Contract(staking, [
  "function admins(address) view returns (bool)",
  "function owner() view returns (address)",
], p);
const m = new ethers.Contract(ms, [
  "function getOwners() view returns (address[])",
  "function transactionCount() view returns (uint256)",
], p);
(async () => {
  console.log("staking owner:", await c.owner());
  const owners = await m.getOwners();
  console.log("multisig owners:", owners);
  for (const a of owners) {
    console.log("  staking admin?", a, await c.admins(a));
  }
  console.log("multisig tx count:", (await m.transactionCount()).toString());
})();
