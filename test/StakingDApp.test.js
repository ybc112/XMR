const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingDApp", function () {
    let owner, admin, user1, user2, user3, users;
    let usdt, xmrToken, staking;

    const ONE_DAY = 86400;
    const INTERVAL = 1800;
    const XMR_PRICE = ethers.parseEther("100");
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

        await staking.connect(admin).dailySettlement(XMR_PRICE);
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

    describe("Static Reward - 1% daily locked", function () {
        beforeEach(setup);

        it("DAILY_RATE is locked to 100 (1%)", async function () {
            expect(await staking.DAILY_RATE()).to.equal(100);
            expect(await staking.SETTLEMENT_INTERVAL()).to.equal(1800);
        });

        it("Manual claim after one full period pays full 1% of investment", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(ethers.parseEther("10000"));

            await time.increase(INTERVAL + 1);

            const est = await staking.estimateStaticReward(user1.address);
            // 10000 * 1% = 100 USDT (每周期=一天)
            const expectedUsdt = ethers.parseEther("10000") * 100n / 10000n;
            expect(est.usdtValue).to.equal(expectedUsdt);
            expect(est.xmrValue).to.equal(expectedUsdt * 10n ** 18n / XMR_PRICE);

            await staking.connect(user1).claimStaticReward();

            const info = await staking.getUserInfo(user1.address);
            expect(info.pendingXMR).to.equal(expectedUsdt * 10n ** 18n / XMR_PRICE);
            expect(info.totalEarned).to.equal(expectedUsdt);

            const estAfter = await staking.estimateStaticReward(user1.address);
            expect(estAfter.usdtValue).to.equal(0);
        });

        it("48 periods (one real day) equals 48% of investment", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(ethers.parseEther("10000"));

            await time.increase(ONE_DAY + 1);

            const est = await staking.estimateStaticReward(user1.address);
            expect(est.usdtValue).to.equal(ethers.parseEther("4800"));
        });

        it("Should not allow claim twice in same period", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await expect(staking.connect(user1).claimStaticReward()).to.be.revertedWith(
                "Already claimed today"
            );
        });
    });

    describe("Automatic Settlement (dailySettlement)", function () {
        beforeEach(setup);

        it("Settles static rewards for all users without manual claim", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await time.increase(INTERVAL + 1);

            const tx = await staking.connect(admin).dailySettlement(XMR_PRICE);
            await expect(tx).to.emit(staking, "StaticRewardClaimed").withArgs(
                user1.address,
                MIN_INVESTMENT * 100n / 10000n,
                MIN_INVESTMENT * 100n / 10000n * 10n ** 18n / XMR_PRICE
            );
            await expect(tx).to.emit(staking, "DailySettlement");

            const info = await staking.getUserInfo(user1.address);
            expect(info.pendingXMR).to.be.gt(0);
            expect(info.totalEarned).to.be.gt(0);

            const est = await staking.estimateStaticReward(user1.address);
            expect(est.usdtValue).to.equal(0);
        });

        it("Settles team rewards automatically along with static rewards", async function () {
            // user1: 3000 自投 + 4 个 2000 直推 -> subArea = 6000 >= 5000 -> level 1
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(ethers.parseEther("3000"));

            for (let i = 0; i < 4; i++) {
                const u = users[i];
                await staking.connect(u).register(user1.address);
                await staking.connect(u).invest(ethers.parseEther("2000"));
            }

            const info1 = await staking.getUserInfo(user1.address);
            expect(info1.level).to.equal(1);

            await time.increase(INTERVAL + 1);

            const tx = await staking.connect(admin).dailySettlement(XMR_PRICE);
            // 每个下级静态收益 2000*1%（每周期=一天），user1 按 5% 级差抽取团队奖
            await expect(tx).to.emit(staking, "TeamReward");

            const after = await staking.getUserInfo(user1.address);
            // 自身静态 + 团队奖均以 XMR 记账
            expect(after.pendingXMR).to.be.gt(0);
        });

        it("Cannot settle twice in same period", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await time.increase(INTERVAL + 1);
            await staking.connect(admin).dailySettlement(XMR_PRICE);

            await expect(
                staking.connect(admin).dailySettlement(XMR_PRICE)
            ).to.be.revertedWith("Already settled this period");
        });

        it("Non-admin cannot call dailySettlement", async function () {
            await expect(
                staking.connect(user1).dailySettlement(XMR_PRICE)
            ).to.be.revertedWith("Not admin");
        });
    });

    describe("3x Exit Mechanism", function () {
        beforeEach(setup);

        it("Should exit when total earned reaches 3x investment", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            // 每周期 1%，单次最多补 30 个周期（=30%），领 10 次达到 3x
            for (let i = 0; i < 10; i++) {
                await time.increase(30 * INTERVAL + 1);
                await staking.connect(user1).claimStaticReward();
            }

            const info = await staking.getUserInfo(user1.address);
            expect(info.exited).to.be.true;
        });

        it("Should allow reinvestment after exit", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            for (let i = 0; i < 10; i++) {
                await time.increase(30 * INTERVAL + 1);
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

            await time.increase(INTERVAL + 1);
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

        it("Should skip blacklisted user in auto settlement", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);
            await staking.setBlacklist(user1.address, true);

            await time.increase(INTERVAL + 1);
            await staking.connect(admin).dailySettlement(XMR_PRICE);

            const info = await staking.getUserInfo(user1.address);
            expect(info.pendingXMR).to.equal(0);
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

        it("Should allow admin to set XMR price", async function () {
            await staking.connect(admin).setXMRPrice(ethers.parseEther("150"));
            expect(await staking.xmrPrice()).to.equal(ethers.parseEther("150"));
        });

        it("Stats report locked 1% daily rate", async function () {
            const stats = await staking.getContractStats();
            expect(stats.dailyRate).to.equal(100);
            expect(stats.computingPower).to.equal(100);
        });
    });
});
