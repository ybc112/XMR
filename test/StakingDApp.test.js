const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingDApp", function () {
    let owner, admin, user1, user2, user3, users;
    let usdt, xmrToken, staking;

    const ONE_DAY = 86400;
    const MIN_INVESTMENT = ethers.parseEther("100");
    const ZERO = ethers.ZeroAddress;

    async function setup() {
        [owner, admin, user1, user2, user3, ...users] = await ethers.getSigners();

        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        usdt = await MockUSDT.deploy();
        await usdt.waitForDeployment();

        const XMRToken = await ethers.getContractFactory("XMRToken");
        xmrToken = await XMRToken.deploy();
        await xmrToken.waitForDeployment();

        const StakingDApp = await ethers.getContractFactory("StakingDApp");
        staking = await StakingDApp.deploy(await usdt.getAddress(), await xmrToken.getAddress());
        await staking.waitForDeployment();

        await xmrToken.setMinter(await staking.getAddress());
        await staking.addAdmin(admin.address);

        for (const u of [owner, admin, user1, user2, user3, ...users.slice(0, 15)]) {
            await usdt.mint(u.address, ethers.parseEther("1000000"));
            await usdt.connect(u).approve(await staking.getAddress(), ethers.MaxUint256);
        }

        await staking.connect(admin).dailySettlement(ethers.parseEther("100"));
    }

    describe("Registration", function () {
        beforeEach(setup);

        it("Should register user with referrer", async function () {
            await staking.connect(user2).register(ZERO);
            await staking.connect(user1).register(user2.address);
            expect(await staking.addressToMemberId(user1.address)).to.be.gte(10001);
        });

        it("Should register root user without referrer", async function () {
            await staking.connect(user1).register(ZERO);
            expect(await staking.addressToMemberId(user1.address)).to.be.gte(10001);
        });

        it("Should not allow self-referral", async function () {
            await expect(staking.connect(user1).register(user1.address)).to.be.revertedWith(
                "Cannot refer self"
            );
        });

        it("Should not allow double registration", async function () {
            await staking.connect(user2).register(ZERO);
            await staking.connect(user1).register(user2.address);
            await expect(staking.connect(user1).register(user3.address)).to.be.revertedWith(
                "Already registered"
            );
        });
    });

    describe("Investment", function () {
        beforeEach(setup);

        it("Should accept investment and update personal amount", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            const info = await staking.getUserInfo(user1.address);
            expect(info.personalAmount).to.equal(MIN_INVESTMENT);
            expect(info.exitLimit).to.equal(MIN_INVESTMENT * 3n);
        });

        it("Should distribute generation rewards to referrer", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await staking.connect(user2).register(user1.address);
            await staking.connect(user2).invest(MIN_INVESTMENT);

            const info = await staking.getUserInfo(user1.address);
            expect(info.pendingUSDT).to.equal(MIN_INVESTMENT * 1000n / 10000n);
        });

        it("Should update team volumes", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await staking.connect(user2).register(user1.address);
            await staking.connect(user2).invest(MIN_INVESTMENT);

            const info = await staking.getUserInfo(user1.address);
            expect(info.teamTotalVolume).to.equal(MIN_INVESTMENT);
        });
    });

    describe("Static Reward", function () {
        beforeEach(setup);

        it("Should claim daily static reward in XMR", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await time.increase(ONE_DAY + 1);

            await staking.connect(user1).claimStaticReward();

            const info = await staking.getUserInfo(user1.address);
            expect(info.pendingXMR).to.be.gt(0);
            expect(info.totalEarned).to.be.gt(0);
        });

        it("Should not allow claim on same day", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await expect(staking.connect(user1).claimStaticReward()).to.be.revertedWith(
                "Already claimed today"
            );
        });
    });

    describe("3x Exit Mechanism", function () {
        beforeEach(setup);

        it("Should exit when total earned reaches 3x investment", async function () {
            await staking.setDailyRate(10000);
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            for (let i = 0; i < 3; i++) {
                await time.increase(ONE_DAY + 1);
                await staking.connect(user1).claimStaticReward();
            }

            const info = await staking.getUserInfo(user1.address);
            expect(info.exited).to.be.true;
        });

        it("Should allow reinvestment after exit", async function () {
            await staking.setDailyRate(10000);
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            for (let i = 0; i < 3; i++) {
                await time.increase(ONE_DAY + 1);
                await staking.connect(user1).claimStaticReward();
            }

            let info = await staking.getUserInfo(user1.address);
            expect(info.exited).to.be.true;

            await staking.connect(user1).invest(MIN_INVESTMENT);
            info = await staking.getUserInfo(user1.address);
            expect(info.exited).to.be.false;
            expect(info.totalEarned).to.equal(0);
        });
    });

    describe("Flash Exchange", function () {
        beforeEach(setup);

        it("Should exchange XMR to USDT", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await time.increase(ONE_DAY + 1);
            await staking.connect(user1).claimStaticReward();

            const infoBefore = await staking.getUserInfo(user1.address);
            const xmrAmount = infoBefore.pendingXMR;

            await staking.connect(user1).flashExchange(xmrAmount);

            const infoAfter = await staking.getUserInfo(user1.address);
            expect(infoAfter.pendingXMR).to.equal(0);
            expect(infoAfter.pendingUSDT).to.be.gt(0);
        });
    });

    describe("Withdrawal", function () {
        beforeEach(setup);

        it("Should withdraw USDT with 5% fee", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await staking.connect(user2).register(user1.address);
            await staking.connect(user2).invest(MIN_INVESTMENT);

            const info = await staking.getUserInfo(user1.address);
            const reward = info.pendingUSDT;
            const expectedActual = reward * 95n / 100n;

            const balanceBefore = await usdt.balanceOf(user1.address);
            await staking.connect(user1).withdrawUSDT(reward);
            const balanceAfter = await usdt.balanceOf(user1.address);

            expect(balanceAfter - balanceBefore).to.equal(expectedActual);
        });
    });

    describe("Blacklist", function () {
        beforeEach(setup);

        it("Should block blacklisted user from investing", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.setBlacklist(user1.address, true);

            await expect(staking.connect(user1).invest(MIN_INVESTMENT)).to.be.revertedWith(
                "User is blacklisted"
            );
        });

        it("Should allow admin to remove blacklist", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.setBlacklist(user1.address, true);
            await staking.setBlacklist(user1.address, false);

            await staking.connect(user1).invest(MIN_INVESTMENT);
            const info = await staking.getUserInfo(user1.address);
            expect(info.personalAmount).to.equal(MIN_INVESTMENT);
        });
    });

    describe("Emergency Pause", function () {
        beforeEach(setup);

        it("Should pause and unpause contract", async function () {
            await staking.emergencyPause();
            expect(await staking.paused()).to.be.true;

            await expect(staking.connect(user1).register(ZERO)).to.be.revertedWith(
                "Contract is paused"
            );

            await staking.emergencyUnpause();
            expect(await staking.paused()).to.be.false;
        });
    });

    describe("Team Rewards - Levels", function () {
        beforeEach(setup);

        it("Should assign level when thresholds met", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(ethers.parseEther("3000"));

            for (let i = 0; i < 4; i++) {
                const u = users[i];
                await usdt.mint(u.address, ethers.parseEther("1000000"));
                await usdt.connect(u).approve(await staking.getAddress(), ethers.MaxUint256);
                await staking.connect(u).register(user1.address);
                await staking.connect(u).invest(ethers.parseEther("2000"));
            }

            const info = await staking.getUserInfo(user1.address);
            expect(info.teamTotalVolume).to.equal(ethers.parseEther("8000"));
            expect(info.maxAreaVolume).to.equal(ethers.parseEther("2000"));
            expect(info.level).to.be.gte(1);
        });
    });

    describe("Admin Functions", function () {
        beforeEach(setup);

        it("Should update daily rate (owner only)", async function () {
            await staking.setDailyRate(200);
            expect(await staking.dailyRate()).to.equal(200);
        });

        it("Should not allow non-owner to set daily rate", async function () {
            await expect(staking.connect(user1).setDailyRate(200)).to.be.reverted;
        });

        it("Should update computing power (owner only)", async function () {
            await staking.setComputingPower(200);
            expect(await staking.computingPower()).to.equal(200);
        });

        it("Should allow admin to set XMR price", async function () {
            await staking.connect(admin).setXMRPrice(ethers.parseEther("150"));
            expect(await staking.xmrPrice()).to.equal(ethers.parseEther("150"));
        });
    });
});
