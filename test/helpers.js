const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_DAY = 86400;
const ZERO = ethers.ZeroAddress;
const E18 = ethers.parseEther("1");

async function deployContracts() {
    const [owner, admin, ...signers] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    const XMRToken = await ethers.getContractFactory("XMRToken");
    const xmrToken = await XMRToken.deploy();
    await xmrToken.waitForDeployment();

    const StakingDApp = await ethers.getContractFactory("StakingDApp");
    const staking = await StakingDApp.deploy(await usdt.getAddress(), await xmrToken.getAddress());
    await staking.waitForDeployment();

    await xmrToken.setMinter(await staking.getAddress());
    await staking.addAdmin(admin.address);

    return { staking, usdt, xmrToken, owner, admin, signers };
}

async function setupUser(usdt, staking, user, amount) {
    const a = amount || ethers.parseEther("1000000");
    await usdt.mint(user.address, a);
    await usdt.connect(user).approve(await staking.getAddress(), ethers.MaxUint256);
}

async function registerAndInvest(staking, user, referrer, amount) {
    const ref = referrer || ZERO;
    await staking.connect(user).register(ref);
    if (amount) {
        await staking.connect(user).invest(amount);
    }
}

async function buildTree(staking, usdt, signers, structure) {
    for (const node of structure) {
        await setupUser(usdt, staking, node.user);
        await registerAndInvest(staking, node.user, node.referrer, node.amount);
    }
}

async function advanceDays(days) {
    await time.increase(days * ONE_DAY + 1);
}

function bp(basisPoints) {
    return basisPoints;
}

module.exports = {
    ONE_DAY,
    ZERO,
    E18,
    deployContracts,
    setupUser,
    registerAndInvest,
    buildTree,
    advanceDays,
    bp
};
