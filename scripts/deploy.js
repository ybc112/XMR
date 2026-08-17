const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    const USDT_ADDRESS = process.env.USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";

    console.log("\n1. Deploying XMRToken...");
    const XMRToken = await ethers.getContractFactory("XMRToken");
    const xmrToken = await XMRToken.deploy();
    await xmrToken.waitForDeployment();
    const xmrTokenAddr = await xmrToken.getAddress();
    console.log("   XMRToken deployed to:", xmrTokenAddr);

    console.log("\n2. Deploying StakingDApp...");
    const StakingDApp = await ethers.getContractFactory("StakingDApp");
    const stakingDApp = await StakingDApp.deploy(USDT_ADDRESS, xmrTokenAddr);
    await stakingDApp.waitForDeployment();
    const stakingDAppAddr = await stakingDApp.getAddress();
    console.log("   StakingDApp deployed to:", stakingDAppAddr);

    console.log("\n3. Setting minter to StakingDApp...");
    await xmrToken.setMinter(stakingDAppAddr);
    console.log("   Minter set to:", stakingDAppAddr);

    console.log("\n4. Deploying MultiSigWallet...");
    const multiSigOwners = process.env.MULTISIG_OWNERS
        ? process.env.MULTISIG_OWNERS.split(",")
        : [deployer.address];
    const multiSigRequired = parseInt(process.env.MULTISIG_REQUIRED || "2");

    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    const multiSig = await MultiSigWallet.deploy(multiSigOwners, multiSigRequired);
    await multiSig.waitForDeployment();
    const multiSigAddr = await multiSig.getAddress();
    console.log("   MultiSigWallet deployed to:", multiSigAddr);
    console.log("   Owners:", multiSigOwners);
    console.log("   Required confirmations:", multiSigRequired);

    console.log("\n5. Adding deployer as admin for automated settlement...");
    await stakingDApp.addAdmin(deployer.address);
    console.log("   Admin added:", deployer.address);

    console.log("\n6. Transferring StakingDApp ownership to MultiSigWallet...");
    await stakingDApp.transferOwnership(multiSigAddr);
    console.log("   Ownership transferred to:", multiSigAddr);

    console.log("\n7. Transferring XMRToken ownership to MultiSigWallet...");
    await xmrToken.transferOwnership(multiSigAddr);
    console.log("   XMRToken ownership transferred to:", multiSigAddr);

    console.log("\n========== Deployment Summary ==========");
    console.log("XMRToken:       ", xmrTokenAddr);
    console.log("StakingDApp:    ", stakingDAppAddr);
    console.log("MultiSigWallet: ", multiSigAddr);
    console.log("USDT (existing):", USDT_ADDRESS);
    console.log("========================================");

    console.log("\nNext steps:");
    console.log("1. Add admins via MultiSigWallet -> StakingDApp.addAdmin()");
    console.log("2. Call dailySettlement() to set XMR price");
    console.log("3. Verify contracts on BscScan");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
