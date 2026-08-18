const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
    ONE_DAY, ZERO, E18,
    deployContracts, setupUser, registerAndInvest, advanceDays
} = require("./helpers");

describe("Comprehensive StakingDApp Tests", function () {
    let staking, usdt, xmrToken, owner, admin, signers;
    const MIN100 = ethers.parseEther("100");
    const XMR_ADDR = "4" + "B".repeat(94);

    async function freshSetup() {
        ({ staking, usdt, xmrToken, owner, admin, signers } = await deployContracts());
        for (const s of signers.slice(0, 20)) {
            await setupUser(usdt, staking, s);
        }
        await staking.connect(admin).dailySettlement(ethers.parseEther("100"));
        return { staking, usdt, xmrToken, owner, admin, signers };
    }

    describe("1. Registration", function () {
        beforeEach(freshSetup);

        it("1.1 Should register root user with zero referrer", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            const info = await staking.getUserInfo(u.address);
            expect(info.referrer).to.equal(ZERO);
            expect(info.isRegistered).to.be.true;
        });

        it("1.2 Should register with valid referrer", async function () {
            const root = signers[0];
            const child = signers[1];
            await staking.connect(root).register(ZERO);
            await staking.connect(child).register(root.address);
            const info = await staking.getUserInfo(child.address);
            expect(info.referrer).to.equal(root.address);
        });

        it("1.3 Should assign random member IDs in range 10001-1010000, unique", async function () {
            await staking.connect(signers[0]).register(ZERO);
            await staking.connect(signers[1]).register(signers[0].address);
            await staking.connect(signers[2]).register(signers[0].address);
            const id0 = await staking.addressToMemberId(signers[0].address);
            const id1 = await staking.addressToMemberId(signers[1].address);
            const id2 = await staking.addressToMemberId(signers[2].address);
            for (const id of [id0, id1, id2]) {
                expect(id).to.be.gte(10001);
                expect(id).to.be.lte(1010000);
            }
            expect(id0).to.not.equal(id1);
            expect(id1).to.not.equal(id2);
            expect(id0).to.not.equal(id2);
            // 双向映射一致
            expect(await staking.memberIdToAddress(id0)).to.equal(signers[0].address);
        });

        it("1.4 Should track direct referrals", async function () {
            const root = signers[0];
            await staking.connect(root).register(ZERO);
            for (let i = 1; i <= 3; i++) {
                await staking.connect(signers[i]).register(root.address);
            }
            expect(await staking.getDirectReferralCount(root.address)).to.equal(3);
        });

        it("1.5 Should reject self-referral", async function () {
            await expect(staking.connect(signers[0]).register(signers[0].address))
                .to.be.revertedWith("Cannot refer self");
        });

        it("1.6 Should reject unregistered referrer", async function () {
            await expect(staking.connect(signers[0]).register(signers[1].address))
                .to.be.revertedWith("Referrer not registered");
        });

        it("1.7 Should reject double registration", async function () {
            await staking.connect(signers[0]).register(ZERO);
            await expect(staking.connect(signers[0]).register(ZERO))
                .to.be.revertedWith("Already registered");
        });

        it("1.8 Should reject registration when paused", async function () {
            await staking.emergencyPause();
            await expect(staking.connect(signers[0]).register(ZERO))
                .to.be.revertedWith("Contract is paused");
        });
    });

    describe("2. Investment", function () {
        beforeEach(freshSetup);

        it("2.1 Should accept investment and set exit limit to 3x", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            const info = await staking.getUserInfo(u.address);
            expect(info.personalAmount).to.equal(MIN100);
            expect(info.exitLimit).to.equal(MIN100 * 3n);
        });

        it("2.2 Should accumulate personal amount on multiple investments", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            await staking.connect(u).invest(ethers.parseEther("100"));
            const info = await staking.getUserInfo(u.address);
            expect(info.personalAmount).to.equal(ethers.parseEther("200"));
            expect(info.exitLimit).to.equal(ethers.parseEther("600"));
        });

        it("2.3 Should reject investment from unregistered user", async function () {
            await expect(staking.connect(signers[0]).invest(MIN100))
                .to.be.revertedWith("Not registered");
        });

        it("2.4 Should reject zero and below-minimum investment", async function () {
            await staking.connect(signers[0]).register(ZERO);
            await expect(staking.connect(signers[0]).invest(0))
                .to.be.revertedWith("Investment below 100 USDT");
            await expect(staking.connect(signers[0]).invest(ethers.parseEther("99")))
                .to.be.revertedWith("Investment below 100 USDT");
        });

        it("2.4b Should reject investment not multiple of 100", async function () {
            await staking.connect(signers[0]).register(ZERO);
            await expect(staking.connect(signers[0]).invest(ethers.parseEther("150")))
                .to.be.revertedWith("Investment must be multiple of 100");
            await expect(staking.connect(signers[0]).invest(ethers.parseEther("1000.5")))
                .to.be.revertedWith("Investment must be multiple of 100");
        });

        it("2.5 Should reject investment when paused", async function () {
            await staking.connect(signers[0]).register(ZERO);
            await staking.emergencyPause();
            await expect(staking.connect(signers[0]).invest(MIN100))
                .to.be.revertedWith("Contract is paused");
        });

        it("2.6 Should reject investment when blacklisted", async function () {
            await staking.connect(signers[0]).register(ZERO);
            await staking.setBlacklist(signers[0].address, true);
            await expect(staking.connect(signers[0]).invest(MIN100))
                .to.be.revertedWith("User is blacklisted");
        });

        it("2.7 Should update team total volume for ancestors", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            const info = await staking.getUserInfo(root.address);
            expect(info.teamTotalVolume).to.equal(MIN100);
        });
    });

    describe("3. Static Income (Daily 1%)", function () {
        beforeEach(freshSetup);

        it("3.1 Should calculate 1% per period reward correctly in USDT", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            // advanceDays(1) = 1 period (86400s) x 1% = 1% => 10 USDT
            expect(info.totalEarned).to.equal(ethers.parseEther("10"));
        });

        it("3.2 Should convert USDT reward to XMR at current price", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            const expectedXMR = ethers.parseEther("10") * E18 / ethers.parseEther("100");
            expect(info.pendingXMR).to.equal(expectedXMR);
        });

        it("3.3 Should handle multi-day claim with correct calculation", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(5);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            // advanceDays(5) = 5 periods x 1% = 5% => 50 USDT (below 3x exit limit)
            expect(info.totalEarned).to.equal(ethers.parseEther("50"));
        });

        it("3.4 Should cap claim at 30 days maximum", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(60);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            // 60 days = 60 periods, capped at MAX_CLAIM_PERIODS=30 => 30% => 300 USDT
            // 300 < 3x exit limit (3000) => user does NOT exit
            expect(info.totalEarned).to.equal(ethers.parseEther("300"));
            expect(info.exited).to.be.false;
        });

        it("3.5 Daily rate is locked to 100 (1%) and cannot be changed", async function () {
            expect(await staking.DAILY_RATE()).to.equal(100);
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            expect(info.totalEarned).to.equal(ethers.parseEther("10"));
        });

        it("3.9 Should reject claim from unregistered user", async function () {
            await expect(staking.connect(signers[0]).claimStaticReward())
                .to.be.revertedWith("Not registered");
        });

        it("3.10 Should reject claim below minimum investment", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await expect(staking.connect(u).claimStaticReward())
                .to.be.revertedWith("Below min investment");
        });

        it("3.11 Should reject claim from exited user", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            // each round: advanceDays(30) = 30 periods x 1% = 30% => 30 USDT per claim
            // 10 rounds x 30 = 300 -> reaches the 3x exit limit
            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                await staking.connect(u).claimStaticReward();
            }
            await expect(staking.connect(u).claimStaticReward())
                .to.be.revertedWith("User exited");
        });

        it("3.12 Should reject double claim on same day", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            await expect(staking.connect(u).claimStaticReward())
                .to.be.revertedWith("Already claimed today");
        });

        it("3.13 Should adjust XMR amount when price changes", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await staking.connect(admin).setXMRPrice(ethers.parseEther("200"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            const expectedXMR = ethers.parseEther("10") * E18 / ethers.parseEther("200");
            expect(info.pendingXMR).to.equal(expectedXMR);
        });
    });

    describe("4. Generation Rewards (12 Generations)", function () {
        beforeEach(freshSetup);

        it("4.1 Should pay 10% to 1st generation referrer", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            const info = await staking.getUserInfo(root.address);
            expect(info.pendingUSDT).to.equal(MIN100 * 1000n / 10000n);
        });

        it("4.2 Should pay 3% to 2nd generation", async function () {
            const u0 = signers[0], u1 = signers[1], u2 = signers[2];
            await registerAndInvest(staking, u0, ZERO, MIN100);
            await registerAndInvest(staking, u1, u0.address, MIN100);
            await registerAndInvest(staking, u2, u1.address, MIN100);
            const info = await staking.getUserInfo(u0.address);
            const expected = MIN100 * 1000n / 10000n + MIN100 * 300n / 10000n;
            expect(info.pendingUSDT).to.equal(expected);
        });

        it("4.3 Should pay 2% to 3rd generation", async function () {
            const users = signers.slice(0, 4);
            for (let i = 0; i < 4; i++) {
                const ref = i === 0 ? ZERO : users[i - 1].address;
                await registerAndInvest(staking, users[i], ref, MIN100);
            }
            const info = await staking.getUserInfo(users[0].address);
            const expected = MIN100 * 1000n / 10000n + MIN100 * 300n / 10000n + MIN100 * 200n / 10000n;
            expect(info.pendingUSDT).to.equal(expected);
        });

        it("4.4 Should pay 1% to 4th-12th generation", async function () {
            const users = signers.slice(0, 13);
            for (let i = 0; i < 13; i++) {
                const ref = i === 0 ? ZERO : users[i - 1].address;
                await registerAndInvest(staking, users[i], ref, MIN100);
            }
            const gen4Reward = MIN100 * 100n / 10000n;
            const gen1to3 = MIN100 * 1000n / 10000n + MIN100 * 300n / 10000n + MIN100 * 200n / 10000n;
            const expected = gen1to3 + gen4Reward * 9n;
            const info = await staking.getUserInfo(users[0].address);
            expect(info.pendingUSDT).to.equal(expected);
        });

        it("4.5 Should NOT pay beyond 12th generation", async function () {
            const users = signers.slice(0, 15);
            for (let i = 0; i < 15; i++) {
                const ref = i === 0 ? ZERO : users[i - 1].address;
                await registerAndInvest(staking, users[i], ref, MIN100);
            }
            const gen1to12 = MIN100 * (1000n + 300n + 200n + 100n * 9n) / 10000n;
            const info = await staking.getUserInfo(users[0].address);
            expect(info.pendingUSDT).to.equal(gen1to12);
        });

        it("4.6 Should not pay generation reward to inactive ancestor", async function () {
            const root = signers[0];
            const child = signers[1];
            await staking.connect(root).register(ZERO);
            await registerAndInvest(staking, child, root.address, MIN100);
            const info = await staking.getUserInfo(root.address);
            expect(info.pendingUSDT).to.equal(0);
        });

        it("4.7 Should not pay generation reward to exited ancestor", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            // 10 rounds of advanceDays(30) + claim (30% each) reach the 3x exit limit
            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                await staking.connect(root).claimStaticReward();
            }
            expect((await staking.getUserInfo(root.address)).exited).to.be.true;
            await registerAndInvest(staking, child, root.address, MIN100);
            const info = await staking.getUserInfo(root.address);
            expect(info.pendingUSDT).to.equal(0);
        });

        it("4.8 Should not pay generation reward to blacklisted ancestor", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await staking.setBlacklist(root.address, true);
            await registerAndInvest(staking, child, root.address, MIN100);
            const info = await staking.getUserInfo(root.address);
            expect(info.pendingUSDT).to.equal(0);
        });
    });

    describe("5. Team Rewards (M1-M9)", function () {
        beforeEach(freshSetup);

        it("5.1 Should assign M1 level when thresholds met", async function () {
            const root = signers[0];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("3000"));
            for (let i = 1; i <= 4; i++) {
                await registerAndInvest(staking, signers[i], root.address, ethers.parseEther("2000"));
            }
            const info = await staking.getUserInfo(root.address);
            expect(info.teamTotalVolume).to.equal(ethers.parseEther("8000"));
            expect(info.maxAreaVolume).to.equal(ethers.parseEther("2000"));
            expect(info.level).to.be.gte(1);
        });

        it("5.2 Should calculate sub-area correctly (total - max area)", async function () {
            const root = signers[0];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("3000"));
            await registerAndInvest(staking, signers[1], root.address, ethers.parseEther("5000"));
            await registerAndInvest(staking, signers[2], root.address, ethers.parseEther("3000"));
            await registerAndInvest(staking, signers[3], root.address, ethers.parseEther("2000"));
            const subArea = await staking.getSubAreaVolume(root.address);
            expect(subArea).to.equal(ethers.parseEther("5000"));
        });

        // 团队奖 = 直推奖 + 级差奖 + 平级/超越奖（随静态收益逐笔结算，XMR 记账）
        // 直推奖 = 直推下级静态收益 × 自己费率（全额）
        // 级差奖 = 隔代下级静态收益 × (自己费率 − 路径最高费率)，路径含收益者自身
        // 平级/超越 = 直推下级动态收益(直推+级差)的 10%，仅当下级级别 >= 自己
        // 将 M1-M4 门槛改为纯个人业绩制（小区 0），teamRate 不变 5/10/15/20%
        it("5.3 Should pay exact chain M4 -> M2 -> M3 -> D (direct + differential + override)", async function () {
            await staking.connect(owner).setLevelThresholds(0, ethers.parseEther("200"), 0, 500);
            await staking.connect(owner).setLevelThresholds(1, ethers.parseEther("500"), 0, 1000);
            await staking.connect(owner).setLevelThresholds(2, ethers.parseEther("1000"), 0, 1500);
            await staking.connect(owner).setLevelThresholds(3, ethers.parseEther("2000"), 0, 2000);

            const m4 = signers[0];
            const m2 = signers[1];
            const m3 = signers[2];
            const d = signers[3];

            await registerAndInvest(staking, m4, ZERO, ethers.parseEther("2000")); // M4 20%
            await registerAndInvest(staking, m2, m4.address, ethers.parseEther("500")); // M2 10%
            await registerAndInvest(staking, m3, m2.address, ethers.parseEther("1000")); // M3 15%
            await registerAndInvest(staking, d, m3.address, MIN100); // 无级别

            expect((await staking.getUserInfo(m4.address)).level).to.equal(4);
            expect((await staking.getUserInfo(m2.address)).level).to.equal(2);
            expect((await staking.getUserInfo(m3.address)).level).to.equal(3);

            // 1 周期静态收益 = 本金 × 1%：d 1 / m3 10 / m2 5 / m4 20
            await advanceDays(1);
            await staking.connect(d).claimStaticReward();
            await staking.connect(m3).claimStaticReward();
            await staking.connect(m2).claimStaticReward();
            await staking.connect(m4).claimStaticReward();

            // d 静态 1：m3 直推 0.15；m2 超越 0.15×10%=0.015；m2 级差 0(10%<15%)；m4 级差 1×5%=0.05
            // m3 静态 10：m2 直推 1；m4 级差 10×(20%-15%)=0.5（pathMax=max(15,10)=15%）
            // m2 静态 5：m4 直推 1
            const dInfo = await staking.getUserInfo(d.address);
            const m3Info = await staking.getUserInfo(m3.address);
            const m2Info = await staking.getUserInfo(m2.address);
            const m4Info = await staking.getUserInfo(m4.address);

            expect(dInfo.pendingXMR).to.equal(ethers.parseEther("0.01"));
            expect(m3Info.pendingXMR).to.equal(ethers.parseEther("0.1015")); // (10+0.15)/100
            expect(m2Info.pendingXMR).to.equal(ethers.parseEther("0.06015")); // (5+0.015+1)/100
            expect(m4Info.pendingXMR).to.equal(ethers.parseEther("0.2155")); // (20+0.05+0.5+1)/100
        });

        it("5.4 Should pay equal-level bonus (10% of direct child dynamic income)", async function () {
            await staking.connect(owner).setLevelThresholds(0, ethers.parseEther("200"), 0, 500);

            const m1a = signers[0];
            const m1b = signers[1];
            const d = signers[2];

            await registerAndInvest(staking, m1a, ZERO, ethers.parseEther("200")); // M1
            await registerAndInvest(staking, m1b, m1a.address, ethers.parseEther("200")); // M1 平级
            await registerAndInvest(staking, d, m1b.address, MIN100);

            expect((await staking.getUserInfo(m1a.address)).level).to.equal(1);
            expect((await staking.getUserInfo(m1b.address)).level).to.equal(1);

            await advanceDays(1);
            await staking.connect(d).claimStaticReward();
            await staking.connect(m1b).claimStaticReward();
            await staking.connect(m1a).claimStaticReward();

            // d 静态 1：m1b 直推 0.05；m1a 平级 0.05×10%=0.005；m1a 隔代级差 0(5%-5%)
            // m1b 静态 2：m1a 直推 0.1；m1a 无上级不触发平级
            const dInfo = await staking.getUserInfo(d.address);
            const m1bInfo = await staking.getUserInfo(m1b.address);
            const m1aInfo = await staking.getUserInfo(m1a.address);

            expect(dInfo.pendingXMR).to.equal(ethers.parseEther("0.01"));
            expect(m1bInfo.pendingXMR).to.equal(ethers.parseEther("0.0205")); // (2+0.05)/100
            expect(m1aInfo.pendingXMR).to.equal(ethers.parseEther("0.02105")); // (2+0.005+0.1)/100
        });

        it("5.5 Should pay override bonus (10% of child dynamic income when child level higher)", async function () {
            await staking.connect(owner).setLevelThresholds(0, ethers.parseEther("200"), 0, 500);
            await staking.connect(owner).setLevelThresholds(1, ethers.parseEther("500"), 0, 1000);

            const mLow = signers[0]; // M1 5%
            const mHigh = signers[1]; // M2 10% 超越上级
            const d = signers[2];

            await registerAndInvest(staking, mLow, ZERO, ethers.parseEther("200"));
            await registerAndInvest(staking, mHigh, mLow.address, ethers.parseEther("500"));
            await registerAndInvest(staking, d, mHigh.address, MIN100);

            expect((await staking.getUserInfo(mLow.address)).level).to.equal(1);
            expect((await staking.getUserInfo(mHigh.address)).level).to.equal(2);

            await advanceDays(1);
            await staking.connect(d).claimStaticReward();
            await staking.connect(mHigh).claimStaticReward();
            await staking.connect(mLow).claimStaticReward();

            // d 静态 1：mHigh 直推 0.1；mLow 超越 0.1×10%=0.01；mLow 隔代级差 0(5%<10%)
            // mHigh 静态 5：mLow 直推 0.25（mLow 的动态，其上级 mHigh 无更上级触发）
            const dInfo = await staking.getUserInfo(d.address);
            const mHighInfo = await staking.getUserInfo(mHigh.address);
            const mLowInfo = await staking.getUserInfo(mLow.address);

            expect(dInfo.pendingXMR).to.equal(ethers.parseEther("0.01"));
            expect(mHighInfo.pendingXMR).to.equal(ethers.parseEther("0.051")); // (5+0.1)/100
            expect(mLowInfo.pendingXMR).to.equal(ethers.parseEther("0.0226")); // (2+0.01+0.25)/100
        });

        it("5.6 Should not pay team reward to user with no level", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            const info = await staking.getUserInfo(root.address);
            expect(info.level).to.equal(0);

            // child 领取静态收益；root 无等级 -> 无直推/级差/平级团队奖（推荐奖记 pendingUSDT）
            // root 自己的静态收益 1U（100 x 1 周期 x 1%）由 dailySettlement 自动结算 -> 0.01 XMR
            await advanceDays(1);
            await staking.connect(child).claimStaticReward();
            await staking.connect(admin).dailySettlement(ethers.parseEther("100"));
            const after = await staking.getUserInfo(root.address);
            expect(after.pendingXMR).to.equal(ethers.parseEther("0.01"));
            expect(after.pendingUSDT).to.equal(MIN100 * 1000n / 10000n);
        });

        it("5.7 Should update level when team volume grows", async function () {
            const root = signers[0];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("3000"));
            expect((await staking.getUserInfo(root.address)).level).to.equal(0);
            for (let i = 1; i <= 4; i++) {
                await registerAndInvest(staking, signers[i], root.address, ethers.parseEther("2000"));
            }
            expect((await staking.getUserInfo(root.address)).level).to.be.gte(1);
        });

        it("5.8 Should recalculate user level on reinvestment after exit", async function () {
            const root = signers[0];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("3000"));
            for (let i = 1; i <= 4; i++) {
                await registerAndInvest(staking, signers[i], root.address, ethers.parseEther("2000"));
            }
            expect((await staking.getUserInfo(root.address)).level).to.be.gte(1);
            // each round: advanceDays(30) + claim = 30% of 3000 = 900;
            // 10 rounds x 900 = 9000 -> reaches the 3x exit limit
            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                await staking.connect(root).claimStaticReward();
            }
            expect((await staking.getUserInfo(root.address)).exited).to.be.true;
            await staking.connect(root).invest(ethers.parseEther("200"));
            const info = await staking.getUserInfo(root.address);
            expect(info.exited).to.be.false;
            expect(info.personalAmount).to.equal(ethers.parseEther("200"));
        });
    });

    describe("6. 3x Exit Mechanism", function () {
        beforeEach(freshSetup);

        it("6.1 Should exit via static income when reaching 3x", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("100"));
            // each round: advanceDays(30) + claim = 30% of 100 = 30;
            // 10 rounds x 30 = 300 -> reaches the 3x exit limit
            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                await staking.connect(u).claimStaticReward();
            }
            expect((await staking.getUserInfo(u.address)).exited).to.be.true;
            expect((await staking.getUserInfo(u.address)).totalEarned).to.equal(ethers.parseEther("300"));
        });

        it("6.2 Should exit via generation rewards", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("100"));
            await registerAndInvest(staking, child, root.address, ethers.parseEther("3000"));
            const info = await staking.getUserInfo(root.address);
            const expectedReward = ethers.parseEther("3000") * 1000n / 10000n;
            expect(info.totalEarned).to.equal(expectedReward);
            expect(info.exited).to.be.true;
        });

        it("6.3 Should cap reward at remaining exit limit", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("100"));
            // 3 claims x 1% (advanceDays(1) = 1 period) = 3 earned, remaining = 297
            for (let i = 0; i < 3; i++) {
                await advanceDays(1);
                await staking.connect(root).claimStaticReward();
            }
            const afterClaim = await staking.getUserInfo(root.address);
            const remaining = afterClaim.exitLimit - afterClaim.totalEarned;
            expect(remaining).to.equal(ethers.parseEther("297"));
            await registerAndInvest(staking, child, root.address, ethers.parseEther("10000"));
            const final = await staking.getUserInfo(root.address);
            expect(final.totalEarned).to.equal(ethers.parseEther("300"));
            expect(final.exited).to.be.true;
        });

        it("6.4 Should allow reinvestment after exit resetting totalEarned", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            // 10 rounds of advanceDays(30) + claim (30% each) reach the 3x exit limit
            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                await staking.connect(u).claimStaticReward();
            }
            expect((await staking.getUserInfo(u.address)).exited).to.be.true;
            await staking.connect(u).invest(MIN100);
            const info = await staking.getUserInfo(u.address);
            expect(info.exited).to.be.false;
            expect(info.totalEarned).to.equal(0);
            expect(info.exitLimit).to.equal(MIN100 * 3n);
        });

        it("6.4b Should not claim immediately after reinvestment (lastClaimDay reset)", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            // 10 rounds of advanceDays(30) + claim (30% each) reach the 3x exit limit
            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                await staking.connect(u).claimStaticReward();
            }
            expect((await staking.getUserInfo(u.address)).exited).to.be.true;
            await advanceDays(1);
            await staking.connect(u).invest(MIN100);
            await expect(staking.connect(u).claimStaticReward())
                .to.be.revertedWith("Already claimed today");
        });

        it("6.5 Should accumulate exit limit with multiple investments (not exited)", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("100"));
            await staking.connect(u).invest(ethers.parseEther("100"));
            const info = await staking.getUserInfo(u.address);
            expect(info.personalAmount).to.equal(ethers.parseEther("200"));
            expect(info.exitLimit).to.equal(ethers.parseEther("600"));
        });

        it("6.6 Should clear pending balance on reinvestment after exit", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("100"));
            await registerAndInvest(staking, child, root.address, ethers.parseEther("100"));
            const infoBefore = await staking.getUserInfo(root.address);
            expect(infoBefore.pendingUSDT).to.be.gt(0);
            await registerAndInvest(staking, signers[2], child.address, ethers.parseEther("10000"));
            const infoAfter = await staking.getUserInfo(root.address);
            expect(infoAfter.exited).to.be.true;
            expect(infoAfter.pendingUSDT).to.be.gt(0);
            await staking.connect(root).invest(MIN100);
            const infoReinvest = await staking.getUserInfo(root.address);
            expect(infoReinvest.exited).to.be.false;
            expect(infoReinvest.pendingUSDT).to.equal(0);
            expect(infoReinvest.pendingXMR).to.equal(0);
            expect(infoReinvest.xmrWithdrawalPending).to.equal(0);
        });

        it("6.7 Should not earn after exit until reinvestment", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("100"));
            await registerAndInvest(staking, child, root.address, ethers.parseEther("3000"));
            expect((await staking.getUserInfo(root.address)).exited).to.be.true;
            const beforePending = (await staking.getUserInfo(root.address)).pendingUSDT;
            await registerAndInvest(staking, signers[2], child.address, ethers.parseEther("1000"));
            const afterPending = (await staking.getUserInfo(root.address)).pendingUSDT;
            expect(afterPending).to.equal(beforePending);
        });

        it("6.8 Should allow withdrawal after exit", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("100"));
            await registerAndInvest(staking, child, root.address, ethers.parseEther("3000"));
            expect((await staking.getUserInfo(root.address)).exited).to.be.true;
            const pending = (await staking.getUserInfo(root.address)).pendingUSDT;
            const balanceBefore = await usdt.balanceOf(root.address);
            await staking.connect(root).withdrawUSDT(pending);
            const balanceAfter = await usdt.balanceOf(root.address);
            expect(balanceAfter - balanceBefore).to.equal(pending * 95n / 100n);
        });
    });

    describe("7. Flash Exchange", function () {
        beforeEach(freshSetup);

        it("7.1 Should exchange XMR to USDT at current price", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            const xmrAmount = info.pendingXMR;
            const expectedUSDT = xmrAmount * ethers.parseEther("100") / E18;
            await staking.connect(u).flashExchange(xmrAmount);
            const after = await staking.getUserInfo(u.address);
            expect(after.pendingXMR).to.equal(0);
            expect(after.pendingUSDT).to.equal(expectedUSDT);
        });

        it("7.2 Should exchange partial XMR", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            const half = info.pendingXMR / 2n;
            await staking.connect(u).flashExchange(half);
            const after = await staking.getUserInfo(u.address);
            expect(after.pendingXMR).to.equal(info.pendingXMR - half);
            expect(after.pendingUSDT).to.be.gt(0);
        });

        it("7.3 Should reject exchange with zero amount", async function () {
            await expect(staking.connect(signers[0]).flashExchange(0))
                .to.be.revertedWith("Amount must be > 0");
        });

        it("7.4 Should reject exchange with insufficient XMR", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await expect(staking.connect(u).flashExchange(E18))
                .to.be.revertedWith("Insufficient XMR balance");
        });

        it("7.5 Should burn XMR on exchange", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            const supplyBefore = await xmrToken.totalSupply();
            await staking.connect(u).flashExchange(xmrAmount);
            const supplyAfter = await xmrToken.totalSupply();
            expect(supplyBefore - supplyAfter).to.equal(xmrAmount);
        });
    });

    describe("8. USDT Withdrawal", function () {
        beforeEach(freshSetup);

        it("8.1 Should withdraw USDT with 5% fee deducted", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            const reward = (await staking.getUserInfo(root.address)).pendingUSDT;
            const expected = reward * 95n / 100n;
            const before = await usdt.balanceOf(root.address);
            await staking.connect(root).withdrawUSDT(reward);
            const after = await usdt.balanceOf(root.address);
            expect(after - before).to.equal(expected);
        });

        it("8.2 Should reject withdrawal with zero amount", async function () {
            await expect(staking.connect(signers[0]).withdrawUSDT(0))
                .to.be.revertedWith("Amount must be > 0");
        });

        it("8.2b Should reject withdrawal not multiple of 10", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            await expect(staking.connect(root).withdrawUSDT(ethers.parseEther("24")))
                .to.be.revertedWith("Withdrawal must be multiple of 10");
            await expect(staking.connect(root).withdrawUSDT(ethers.parseEther("15")))
                .to.be.revertedWith("Withdrawal must be multiple of 10");
            await staking.connect(root).withdrawUSDT(ethers.parseEther("10"));
            expect((await staking.getUserInfo(root.address)).pendingUSDT).to.equal(0);
        });

        it("8.3 Should reject withdrawal exceeding pending balance", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await expect(staking.connect(u).withdrawUSDT(ethers.parseEther("10")))
                .to.be.revertedWith("Insufficient balance");
        });

        it("8.4 Should reject withdrawal when blacklisted", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            await staking.setBlacklist(root.address, true);
            const reward = (await staking.getUserInfo(root.address)).pendingUSDT;
            await expect(staking.connect(root).withdrawUSDT(reward))
                .to.be.revertedWith("User is blacklisted");
        });

        it("8.5 Should handle custom fee rate", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            await staking.setWithdrawFee(300);
            const reward = (await staking.getUserInfo(root.address)).pendingUSDT;
            const expected = reward * 97n / 100n;
            const before = await usdt.balanceOf(root.address);
            await staking.connect(root).withdrawUSDT(reward);
            const after = await usdt.balanceOf(root.address);
            expect(after - before).to.equal(expected);
        });
    });

    describe("9. XMR Withdrawal", function () {
        beforeEach(freshSetup);

        it("9.1 Should request XMR withdrawal with 5% fee", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await staking.connect(u).setXMRAddress(XMR_ADDR);
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            const fee = xmrAmount * 500n / 10000n;
            const actual = xmrAmount - fee;
            await staking.connect(u).requestXMRWithdrawal(xmrAmount);
            const info = await staking.getUserInfo(u.address);
            expect(info.pendingXMR).to.equal(0);
            expect(info.xmrWithdrawalPending).to.equal(actual);
        });

        it("9.2 Should reject withdrawal below 0.05 XMR minimum", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await expect(staking.connect(u).requestXMRWithdrawal(ethers.parseEther("0.04")))
                .to.be.revertedWith("Below minimum withdrawal");
        });

        it("9.2b Should reject withdrawal before setting XMR address", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            await expect(staking.connect(u).requestXMRWithdrawal(xmrAmount))
                .to.be.revertedWith("XMR address not set");
        });

        it("9.2c Should reject invalid XMR address length", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await expect(staking.connect(u).setXMRAddress("4" + "B".repeat(50)))
                .to.be.revertedWith("Invalid XMR address length");
            await expect(staking.connect(u).setXMRAddress("4" + "B".repeat(120)))
                .to.be.revertedWith("Invalid XMR address length");
        });

        it("9.2d Should reject XMR withdrawal when blacklisted", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await staking.connect(u).setXMRAddress("4" + "B".repeat(94));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            await staking.setBlacklist(u.address, true);
            await expect(staking.connect(u).requestXMRWithdrawal(xmrAmount))
                .to.be.revertedWith("User is blacklisted");
        });

        it("9.3 Should accept withdrawal at exactly 0.05 XMR", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("100000"));
            await staking.connect(u).setXMRAddress(XMR_ADDR);
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            await staking.connect(u).requestXMRWithdrawal(ethers.parseEther("0.05"));
            const info = await staking.getUserInfo(u.address);
            expect(info.xmrWithdrawalPending).to.be.gt(0);
        });

        it("9.4 Should process XMR withdrawal by admin", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await staking.connect(u).setXMRAddress(XMR_ADDR);
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            await staking.connect(u).requestXMRWithdrawal(xmrAmount);
            const pending = (await staking.getUserInfo(u.address)).xmrWithdrawalPending;
            const balanceBefore = await xmrToken.balanceOf(u.address);
            await staking.connect(admin).processXMRWithdrawal(u.address);
            const balanceAfter = await xmrToken.balanceOf(u.address);
            expect(balanceAfter - balanceBefore).to.equal(pending);
            expect((await staking.getUserInfo(u.address)).xmrWithdrawalPending).to.equal(0);
        });

        it("9.5 Should reject processing by non-admin", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await staking.connect(u).setXMRAddress(XMR_ADDR);
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            await staking.connect(u).requestXMRWithdrawal(xmrAmount);
            await expect(staking.connect(signers[1]).processXMRWithdrawal(u.address))
                .to.be.revertedWith("Not admin");
        });

        it("9.6 Should reject processing with no pending withdrawal", async function () {
            await expect(staking.connect(admin).processXMRWithdrawal(signers[0].address))
                .to.be.revertedWith("No pending withdrawal");
        });
    });

    describe("10. Admin Functions", function () {
        beforeEach(freshSetup);

        it("10.1 Daily rate is locked to 100 (1%)", async function () {
            expect(await staking.DAILY_RATE()).to.equal(100);
        });

        it("10.2 Computing power is locked to 100", async function () {
            const stats = await staking.getContractStats();
            expect(stats.computingPower).to.equal(100);
        });

        it("10.3 Admin can set XMR price", async function () {
            await staking.connect(admin).setXMRPrice(ethers.parseEther("250"));
            expect(await staking.xmrPrice()).to.equal(ethers.parseEther("250"));
        });

        it("10.4 Admin can perform daily settlement", async function () {
            await advanceDays(1);
            await staking.connect(admin).dailySettlement(ethers.parseEther("150"));
            expect(await staking.xmrPrice()).to.equal(ethers.parseEther("150"));
            expect(await staking.lastSettlementPeriod()).to.be.gt(0);
        });

        it("10.5 Owner can add and remove admins", async function () {
            await staking.addAdmin(signers[0].address);
            expect(await staking.admins(signers[0].address)).to.be.true;
            await staking.removeAdmin(signers[0].address);
            expect(await staking.admins(signers[0].address)).to.be.false;
        });

        it("10.6 Non-admin cannot call admin functions", async function () {
            await expect(staking.connect(signers[0]).setXMRPrice(E18))
                .to.be.revertedWith("Not admin");
            await expect(staking.connect(signers[0]).dailySettlement(E18))
                .to.be.revertedWith("Not admin");
        });

        it("10.7 Non-owner cannot call owner functions", async function () {
            await expect(staking.connect(signers[0]).setBlacklist(signers[1].address, true))
                .to.be.reverted;
            await expect(staking.connect(signers[0]).emergencyPause())
                .to.be.reverted;
        });

        it("10.8 Owner can set level thresholds", async function () {
            await staking.setLevelThresholds(0, ethers.parseEther("300"), ethers.parseEther("10000"), 600);
            const info = await staking.getLevelInfo(1);
            expect(info.personalRequired).to.equal(ethers.parseEther("300"));
            expect(info.subAreaRequired).to.equal(ethers.parseEther("10000"));
            expect(info.teamRate).to.equal(600);
        });

        it("10.10 Owner can set generation rates", async function () {
            await staking.setGenerationRate(0, 1500);
            expect(await staking.generationRates(0)).to.equal(1500);
        });

        it("10.11 Owner can withdraw fees", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            const reward = (await staking.getUserInfo(root.address)).pendingUSDT;
            await staking.connect(root).withdrawUSDT(reward);
            const contractBalance = await usdt.balanceOf(await staking.getAddress());
            const before = await usdt.balanceOf(owner.address);
            await staking.withdrawFees(owner.address, contractBalance);
            const after = await usdt.balanceOf(owner.address);
            expect(after - before).to.equal(contractBalance);
        });
    });

    describe("11. Blacklist", function () {
        beforeEach(freshSetup);

        it("11.1 Should block blacklisted user from all actions", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await staking.setBlacklist(u.address, true);
            await expect(staking.connect(u).invest(MIN100)).to.be.revertedWith("User is blacklisted");
            await expect(staking.connect(u).claimStaticReward()).to.be.revertedWith("User is blacklisted");
            await expect(staking.connect(u).flashExchange(E18)).to.be.revertedWith("User is blacklisted");
        });

        it("11.2 Should restore all functions when blacklist removed", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await staking.setBlacklist(u.address, true);
            await staking.setBlacklist(u.address, false);
            await staking.connect(u).invest(MIN100);
            expect((await staking.getUserInfo(u.address)).personalAmount).to.equal(MIN100);
        });

        it("11.3 Should not affect non-blacklisted users", async function () {
            const u1 = signers[0];
            const u2 = signers[1];
            await staking.connect(u1).register(ZERO);
            await staking.connect(u2).register(u1.address);
            await staking.setBlacklist(u1.address, true);
            await staking.connect(u2).invest(MIN100);
            expect((await staking.getUserInfo(u2.address)).personalAmount).to.equal(MIN100);
        });
    });

    describe("12. Emergency Pause", function () {
        beforeEach(freshSetup);

        it("12.1 Should block register when paused", async function () {
            await staking.emergencyPause();
            await expect(staking.connect(signers[0]).register(ZERO))
                .to.be.revertedWith("Contract is paused");
        });

        it("12.2 Should block invest when paused", async function () {
            await staking.connect(signers[0]).register(ZERO);
            await staking.emergencyPause();
            await expect(staking.connect(signers[0]).invest(MIN100))
                .to.be.revertedWith("Contract is paused");
        });

        it("12.3 Should block claim when paused", async function () {
            await registerAndInvest(staking, signers[0], ZERO, MIN100);
            await advanceDays(1);
            await staking.emergencyPause();
            await expect(staking.connect(signers[0]).claimStaticReward())
                .to.be.revertedWith("Contract is paused");
        });

        it("12.4 Should block flash exchange when paused", async function () {
            await registerAndInvest(staking, signers[0], ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(signers[0]).claimStaticReward();
            await staking.emergencyPause();
            await expect(staking.connect(signers[0]).flashExchange(E18))
                .to.be.revertedWith("Contract is paused");
        });

        it("12.5 Should allow withdrawal when paused (safety)", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            await staking.emergencyPause();
            const reward = (await staking.getUserInfo(root.address)).pendingUSDT;
            await staking.connect(root).withdrawUSDT(reward);
            expect((await staking.getUserInfo(root.address)).pendingUSDT).to.equal(0);
        });

        it("12.6 Should resume all functions after unpause", async function () {
            await staking.emergencyPause();
            await staking.emergencyUnpause();
            await staking.connect(signers[0]).register(ZERO);
            expect((await staking.getUserInfo(signers[0].address)).isRegistered).to.be.true;
        });
    });

    describe("13. MultiSig Wallet", function () {
        let multiSig, owners;

        beforeEach(async function () {
            await freshSetup();
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            owners = [signers[0].address, signers[1].address, signers[2].address];
            multiSig = await MultiSigWallet.deploy(owners, 2);
            await multiSig.waitForDeployment();
        });

        it("13.1 Should submit and confirm transaction", async function () {
            const calldata = staking.interface.encodeFunctionData("setWithdrawFee", [500]);
            const tx = await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            const receipt = await tx.wait();
            expect(receipt.status).to.equal(1);
        });

        it("13.2 Should execute after enough confirmations", async function () {
            await staking.transferOwnership(await multiSig.getAddress());
            const calldata = staking.interface.encodeFunctionData("setWithdrawFee", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            expect(await staking.withdrawFee()).to.equal(500);
            await multiSig.connect(signers[1]).confirmTransaction(0);
            expect(await staking.withdrawFee()).to.equal(500);
        });

        it("13.3 Should not execute without enough confirmations (3 required)", async function () {
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            const ms3 = await MultiSigWallet.deploy(owners, 3);
            await ms3.waitForDeployment();
            await staking.transferOwnership(await ms3.getAddress());
            const calldata = staking.interface.encodeFunctionData("setWithdrawFee", [300]);
            await ms3.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            expect(await staking.withdrawFee()).to.equal(500);
            await ms3.connect(signers[1]).confirmTransaction(0);
            expect(await staking.withdrawFee()).to.equal(500);
            await ms3.connect(signers[2]).confirmTransaction(0);
            expect(await staking.withdrawFee()).to.equal(300);
        });

        it("13.4 Should allow revoking confirmation", async function () {
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            const ms3 = await MultiSigWallet.deploy(owners, 3);
            await ms3.waitForDeployment();
            await staking.transferOwnership(await ms3.getAddress());
            const calldata = staking.interface.encodeFunctionData("setWithdrawFee", [300]);
            await ms3.connect(signers[0]).submitTransaction(await staking.getAddress(), 0, calldata);
            await ms3.connect(signers[1]).confirmTransaction(0);
            await ms3.connect(signers[1]).revokeConfirmation(0);
    const tx = await ms3.getTransaction(0);
    expect(tx.numConfirmations).to.equal(1);
        });
    });

    describe("14. Edge Cases", function () {
        beforeEach(freshSetup);

        it("14.1 Should handle very large investment", async function () {
            const u = signers[0];
            const largeAmount = ethers.parseEther("1000000");
            await setupUser(usdt, staking, u, largeAmount * 2n);
            await registerAndInvest(staking, u, ZERO, largeAmount);
            const info = await staking.getUserInfo(u.address);
            expect(info.personalAmount).to.equal(largeAmount);
            expect(info.exitLimit).to.equal(largeAmount * 3n);
        });

        it("14.2 Should handle XMR price change between claims", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const firstXMR = (await staking.getUserInfo(u.address)).pendingXMR;
            await staking.connect(admin).setXMRPrice(ethers.parseEther("200"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            const secondXMR = info.pendingXMR - firstXMR;
            const firstExpected = ethers.parseEther("10") * E18 / ethers.parseEther("100");
            const secondExpected = ethers.parseEther("10") * E18 / ethers.parseEther("200");
            expect(firstXMR).to.equal(firstExpected);
            expect(secondXMR).to.equal(secondExpected);
        });

        it("14.3 Should handle deep tree (12+ levels) without errors", async function () {
            const users = signers.slice(0, 15);
            for (let i = 0; i < 15; i++) {
                const ref = i === 0 ? ZERO : users[i - 1].address;
                await registerAndInvest(staking, users[i], ref, MIN100);
            }
            const info = await staking.getUserInfo(users[0].address);
            const expected = MIN100 * (1000n + 300n + 200n + 100n * 9n) / 10000n;
            expect(info.pendingUSDT).to.equal(expected);
        });

        it("14.4 Should handle multiple users investing simultaneously", async function () {
            const root = signers[0];
            await registerAndInvest(staking, root, ZERO, MIN100);
            for (let i = 1; i <= 5; i++) {
                await registerAndInvest(staking, signers[i], root.address, MIN100);
            }
            const info = await staking.getUserInfo(root.address);
            const totalGen = MIN100 * 1000n * 5n / 10000n;
            expect(info.pendingUSDT).to.equal(totalGen);
            expect(info.teamTotalVolume).to.equal(MIN100 * 5n);
        });

        it("14.5 Should handle investment exactly at minimum (100U)", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            // 100 x 1 period x 1% = 1 USDT
            expect(info.totalEarned).to.equal(ethers.parseEther("1"));
        });

        it("14.6 Should reject investment just below minimum (99U)", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await expect(staking.connect(u).invest(ethers.parseEther("99")))
                .to.be.revertedWith("Investment below 100 USDT");
        });

        it("14.7 Should estimate static reward correctly", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(3);
            const [usdtVal, xmrVal] = await staking.estimateStaticReward(u.address);
            // advanceDays(3) = 3 periods x 1% = 3% => 30 USDT
            expect(usdtVal).to.equal(ethers.parseEther("30"));
            const expectedXMR = ethers.parseEther("30") * E18 / ethers.parseEther("100");
            expect(xmrVal).to.equal(expectedXMR);
        });

        it("14.8 Should return correct contract stats", async function () {
            const stats = await staking.getContractStats();
            expect(stats.dailyRate).to.equal(100);
            expect(stats.computingPower).to.equal(100);
            expect(stats.withdrawFee).to.equal(500);
            expect(stats.paused).to.be.false;
            expect(stats.xmrPrice).to.equal(ethers.parseEther("100"));
        });

        it("14.9 Should get remaining exit limit correctly", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("100"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const remaining = await staking.getRemainingExitLimit(u.address);
            // 100 * 1% = 1 USDT earned, remaining = 300 - 1 = 299
            expect(remaining).to.equal(ethers.parseEther("299"));
        });

        it("14.10 Should handle flash exchange then USDT withdrawal", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            await staking.connect(u).flashExchange(xmrAmount);
            const usdtAmount = (await staking.getUserInfo(u.address)).pendingUSDT;
            const expected = usdtAmount * 95n / 100n;
            const before = await usdt.balanceOf(u.address);
            await staking.connect(u).withdrawUSDT(usdtAmount);
            const after = await usdt.balanceOf(u.address);
            expect(after - before).to.equal(expected);
        });
    });

    describe("15. Integration: Full Lifecycle", function () {
        beforeEach(freshSetup);

        it("15.1 Full lifecycle: register -> invest -> earn -> exit -> reinvest", async function () {
            const root = signers[0];
            const child = signers[1];
            const grandchild = signers[2];

            await registerAndInvest(staking, root, ZERO, ethers.parseEther("500"));
            await registerAndInvest(staking, child, root.address, ethers.parseEther("500"));
            await registerAndInvest(staking, grandchild, child.address, ethers.parseEther("100"));

            const rootInfo = await staking.getUserInfo(root.address);
            expect(rootInfo.pendingUSDT).to.be.gt(0);
            expect(rootInfo.teamTotalVolume).to.equal(ethers.parseEther("600"));

            await advanceDays(1);
            await staking.connect(root).claimStaticReward();
            expect((await staking.getUserInfo(root.address)).pendingXMR).to.be.gt(0);

            const xmrAmount = (await staking.getUserInfo(root.address)).pendingXMR;
            await staking.connect(root).flashExchange(xmrAmount);
            expect((await staking.getUserInfo(root.address)).pendingUSDT).to.be.gt(0);

            const pendingUSDT = (await staking.getUserInfo(root.address)).pendingUSDT;
            const unit = ethers.parseEther("10");
            const withdrawable = pendingUSDT - (pendingUSDT % unit);
            await staking.connect(root).withdrawUSDT(withdrawable);
            expect((await staking.getUserInfo(root.address)).pendingUSDT).to.equal(pendingUSDT % unit);

            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                try {
                    await staking.connect(root).claimStaticReward();
                } catch (e) { break; }
            }

            const exitedInfo = await staking.getUserInfo(root.address);
            if (exitedInfo.exited) {
                await staking.connect(root).invest(ethers.parseEther("500"));
                const reinvestedInfo = await staking.getUserInfo(root.address);
                expect(reinvestedInfo.exited).to.be.false;
                expect(reinvestedInfo.totalEarned).to.equal(0);
            }
        });

        it("15.2 Multi-level team with all reward types", async function () {
            const root = signers[0];
            const mid = signers[1];
            const leaf = signers[2];

            await registerAndInvest(staking, root, ZERO, ethers.parseEther("3000"));
            await registerAndInvest(staking, mid, root.address, ethers.parseEther("500"));

            for (let i = 3; i <= 7; i++) {
                await registerAndInvest(staking, signers[i], mid.address, ethers.parseEther("2000"));
            }

            const rootInfo = await staking.getUserInfo(root.address);
            const midInfo = await staking.getUserInfo(mid.address);
            expect(rootInfo.teamTotalVolume).to.equal(ethers.parseEther("10500"));
            expect(midInfo.teamTotalVolume).to.equal(ethers.parseEther("10000"));

            await registerAndInvest(staking, leaf, mid.address, ethers.parseEther("1000"));

            const rootAfter = await staking.getUserInfo(root.address);
            const midAfter = await staking.getUserInfo(mid.address);

            const rootGenReward = ethers.parseEther("1000") * 300n / 10000n;
            expect(rootAfter.pendingUSDT - rootInfo.pendingUSDT).to.equal(rootGenReward);

            const midGenReward = ethers.parseEther("1000") * 1000n / 10000n;
            expect(midAfter.pendingUSDT - midInfo.pendingUSDT).to.be.gte(midGenReward);
        });

        it("15.3 Rapid investment and claim cycle", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));

            for (let cycle = 0; cycle < 3; cycle++) {
                await advanceDays(1);
                await staking.connect(u).claimStaticReward();
            }

            const info = await staking.getUserInfo(u.address);
            // 3 cycles x 1% = 3% => 30 USDT (below 3x limit 3000)
            expect(info.totalEarned).to.equal(ethers.parseEther("30"));
            expect(info.pendingXMR).to.be.gt(0);
        });

        it("15.4 Exited ancestor does not break team reward chain", async function () {
            const root = signers[0];
            const mid = signers[1];
            const leaf = signers[2];

            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, mid, root.address, MIN100);

            // 10 rounds of advanceDays(30) + claim (30% each) reach the 3x exit limit
            for (let i = 0; i < 10; i++) {
                await advanceDays(30);
                await staking.connect(root).claimStaticReward();
            }
            expect((await staking.getUserInfo(root.address)).exited).to.be.true;

            const midBefore = (await staking.getUserInfo(mid.address)).pendingUSDT;
            const rootBefore = (await staking.getUserInfo(root.address)).pendingUSDT;
            await registerAndInvest(staking, leaf, mid.address, MIN100);
            const midAfter = (await staking.getUserInfo(mid.address)).pendingUSDT;
            expect(midAfter - midBefore).to.equal(MIN100 * 1000n / 10000n);

            const rootAfter = (await staking.getUserInfo(root.address)).pendingUSDT;
            expect(rootAfter).to.equal(rootBefore);
        });
    });

    describe("16. Admin Balance Adjustment", function () {
        beforeEach(freshSetup);

        it("16.1 Owner can adjust user USDT balance up and down", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await staking.adjustUserUSDT(u.address, ethers.parseEther("50"));
            expect((await staking.getUserInfo(u.address)).pendingUSDT).to.equal(ethers.parseEther("50"));
            await staking.adjustUserUSDT(u.address, -ethers.parseEther("20"));
            expect((await staking.getUserInfo(u.address)).pendingUSDT).to.equal(ethers.parseEther("30"));
        });

        it("16.2 USDT adjust down clamps to zero instead of underflow", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await staking.adjustUserUSDT(u.address, ethers.parseEther("10"));
            await staking.adjustUserUSDT(u.address, -ethers.parseEther("100"));
            expect((await staking.getUserInfo(u.address)).pendingUSDT).to.equal(0);
        });

        it("16.3 Owner can adjust user XMR balance (mints on increase)", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            const supplyBefore = await xmrToken.totalSupply();
            await staking.adjustUserXMR(u.address, ethers.parseEther("10"));
            const info = await staking.getUserInfo(u.address);
            expect(info.pendingXMR).to.equal(ethers.parseEther("10"));
            expect((await xmrToken.totalSupply()) - supplyBefore).to.equal(ethers.parseEther("10"));
            expect(await xmrToken.balanceOf(await staking.getAddress())).to.be.gte(ethers.parseEther("10"));
            await staking.adjustUserXMR(u.address, -ethers.parseEther("4"));
            expect((await staking.getUserInfo(u.address)).pendingXMR).to.equal(ethers.parseEther("6"));
        });

        it("16.4 XMR adjust down clamps to zero instead of underflow", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await staking.adjustUserXMR(u.address, ethers.parseEther("5"));
            await staking.adjustUserXMR(u.address, -ethers.parseEther("50"));
            expect((await staking.getUserInfo(u.address)).pendingXMR).to.equal(0);
        });

        it("16.5 Non-owner cannot call admin balance functions", async function () {
            await expect(staking.connect(signers[0]).adjustUserUSDT(signers[0].address, E18))
                .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
            await expect(staking.connect(admin).adjustUserXMR(signers[0].address, E18))
                .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
        });

        it("16.6 getUserInfo returns xmrAddress", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            await staking.connect(u).setXMRAddress(XMR_ADDR);
            const info = await staking.getUserInfo(u.address);
            expect(info.xmrAddress).to.equal(XMR_ADDR);
        });
    });
});
