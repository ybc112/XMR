const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingDApp", function () {
    let owner, admin, user1, user2, user3, users;
    let usdt, xmrToken, staking;

    const ONE_DAY = 86400;
    const INTERVAL = 86400;
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
        staking = await StakingDApp.deploy(await usdt.getAddress(), await xmrToken.getAddress(), 0);
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
            expect(await staking.settlementInterval()).to.equal(86400);
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

        it("One real day (1 period) equals 1% of investment", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(ethers.parseEther("10000"));

            await time.increase(ONE_DAY + 1);

            const est = await staking.estimateStaticReward(user1.address);
            expect(est.usdtValue).to.equal(ethers.parseEther("100"));
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

        it("Should not double pay across paged settlement calls in same period", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            await time.increase(INTERVAL + 1);
            await staking.connect(admin).dailySettlement(XMR_PRICE);

            const info1 = await staking.getUserInfo(user1.address);
            // 分页结算语义：同一周期可反复调用（补齐剩余用户），已结算用户不重复发放
            await expect(
                staking.connect(admin).dailySettlement(XMR_PRICE)
            ).to.not.be.reverted;
            const info2 = await staking.getUserInfo(user1.address);
            expect(info2.pendingXMR).to.equal(info1.pendingXMR);
            expect(info2.totalEarned).to.equal(info1.totalEarned);
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
            // 多仓位设计：历史已赚保留，新仓位独立开始 3 倍周期
            expect(info.totalEarned).to.equal(MIN_INVESTMENT * 3n);
            expect(await staking.getPositionCount(user1.address)).to.equal(2);
            expect(info.personalAmount).to.equal(MIN_INVESTMENT * 2n);
            expect(info.exitLimit).to.equal(MIN_INVESTMENT * 6n);
        });
    });

    describe("Multi-Position（独立仓位记账）", function () {
        beforeEach(setup);

        it("Creates a new independent position per investment (no principal merge)", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            expect(await staking.getPositionCount(user1.address)).to.equal(2);
            const p1 = await staking.getPositionInfo(user1.address, 0);
            const p2 = await staking.getPositionInfo(user1.address, 1);
            expect(p1.principal).to.equal(MIN_INVESTMENT);
            expect(p2.principal).to.equal(MIN_INVESTMENT);
            expect(p1.closed).to.be.false;
            expect(p2.closed).to.be.false;

            const info = await staking.getUserInfo(user1.address);
            expect(info.personalAmount).to.equal(MIN_INVESTMENT * 2n);
            expect(info.exitLimit).to.equal(MIN_INVESTMENT * 6n);
        });

        it("Static reward accumulates per position with independent claim progress", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT); // 仓位 1 在周期 P0

            await time.increase(INTERVAL + 1);
            await staking.connect(user1).invest(MIN_INVESTMENT); // 仓位 2 在周期 P1

            await time.increase(INTERVAL + 1);
            await staking.connect(user1).claimStaticReward();    // 结算于 P2

            // 仓位 1 过期 2 个周期（2%），仓位 2 过期 1 个周期（1%）——互不干扰
            const p1 = await staking.getPositionInfo(user1.address, 0);
            const p2 = await staking.getPositionInfo(user1.address, 1);
            expect(p1.earned).to.equal(MIN_INVESTMENT * 200n / 10000n);
            expect(p2.earned).to.equal(MIN_INVESTMENT * 100n / 10000n);

            // 账号级汇总
            const info = await staking.getUserInfo(user1.address);
            expect(info.totalEarned).to.equal(MIN_INVESTMENT * 300n / 10000n);
        });

        it("Dynamic rewards fill positions FIFO: +20 closes position 1, +80 overflows to position 2", async function () {
            await staking.connect(user1).register(ZERO); // root 仓位1
            await staking.connect(user1).invest(MIN_INVESTMENT);

            // child A 投 2800 -> root 推荐奖 280，仓位1 earned=280（剩 20）
            await staking.connect(user2).register(user1.address);
            await staking.connect(user2).invest(ethers.parseEther("2800"));
            let p1 = await staking.getPositionInfo(user1.address, 0);
            expect(p1.earned).to.equal(ethers.parseEther("280"));

            // root 补投 100 -> 生成仓位2
            await staking.connect(user1).invest(MIN_INVESTMENT);

            // child B 投 1000 -> 推荐奖 100：仓位1 补满 +20 出局，溢出 +80 进仓位2
            await staking.connect(user3).register(user1.address);
            await staking.connect(user3).invest(ethers.parseEther("1000"));

            p1 = await staking.getPositionInfo(user1.address, 0);
            const p2 = await staking.getPositionInfo(user1.address, 1);
            expect(p1.earned).to.equal(ethers.parseEther("300"));
            expect(p1.closed).to.be.true;
            expect(p2.earned).to.equal(ethers.parseEther("80"));
            expect(p2.closed).to.be.false;

            const info = await staking.getUserInfo(user1.address);
            expect(info.totalEarned).to.equal(ethers.parseEther("380"));
            expect(info.exited).to.be.false;
        });

        it("Closed position stops earning while remaining positions continue", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT); // 仓位1
            await staking.connect(user1).invest(MIN_INVESTMENT); // 仓位2

            // child 投 3000 -> 推荐奖 300 填满仓位1（FIFO 先补最早的）
            await staking.connect(user2).register(user1.address);
            await staking.connect(user2).invest(ethers.parseEther("3000"));
            let p1 = await staking.getPositionInfo(user1.address, 0);
            let p2 = await staking.getPositionInfo(user1.address, 1);
            expect(p1.closed).to.be.true;
            expect(p1.earned).to.equal(ethers.parseEther("300"));
            expect(p2.earned).to.equal(0);

            // 之后结算只发仓位2
            await time.increase(INTERVAL + 1);
            await staking.connect(user1).claimStaticReward();
            p1 = await staking.getPositionInfo(user1.address, 0);
            p2 = await staking.getPositionInfo(user1.address, 1);
            expect(p1.earned).to.equal(ethers.parseEther("300")); // 不再增长
            expect(p2.earned).to.equal(MIN_INVESTMENT * 100n / 10000n);
            expect(p2.closed).to.be.false;

            const info = await staking.getUserInfo(user1.address);
            expect(info.exited).to.be.false; // 仓位2 未满 -> 账号未出局
        });

        it("Account exits only when all positions are closed", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT); // 仓位1

            // childA 投 3000 -> 仓位1 填满关闭
            await staking.connect(user2).register(user1.address);
            await staking.connect(user2).invest(ethers.parseEther("3000"));
            // childB 投 2000 -> 200 进仓位1? 不，仓位1已满但需先有仓位2
            // 先补第二仓位，再通过 childB 填满
            await staking.connect(user1).invest(MIN_INVESTMENT); // 仓位2
            expect((await staking.getUserInfo(user1.address)).exited).to.be.false;

            // childC 投 3000 -> 300 填满仓位2 -> 全部关闭 -> 账号出局
            await staking.connect(user3).register(user1.address);
            await staking.connect(user3).invest(ethers.parseEther("3000"));

            const p1 = await staking.getPositionInfo(user1.address, 0);
            const p2 = await staking.getPositionInfo(user1.address, 1);
            expect(p1.closed).to.be.true;
            expect(p2.closed).to.be.true;

            const info = await staking.getUserInfo(user1.address);
            expect(info.exited).to.be.true;
            expect(info.totalEarned).to.equal(ethers.parseEther("600"));

            // 出局后不再产生收益
            await time.increase(INTERVAL + 1);
            await expect(staking.connect(user1).claimStaticReward()).to.be.revertedWith("User exited");
            const after = await staking.getUserInfo(user1.address);
            expect(after.totalEarned).to.equal(ethers.parseEther("600"));
        });

        it("Reinvestment after exit still earns from the new position only", async function () {
            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);
            await staking.connect(user2).register(user1.address);
            await staking.connect(user2).invest(ethers.parseEther("3000"));

            let p1 = await staking.getPositionInfo(user1.address, 0);
            expect(p1.closed).to.be.true;
            expect((await staking.getUserInfo(user1.address)).exited).to.be.true;

            await staking.connect(user1).invest(MIN_INVESTMENT); // 出局后复投
            expect((await staking.getUserInfo(user1.address)).exited).to.be.false;

            await time.increase(INTERVAL + 1);
            await staking.connect(user1).claimStaticReward();
            const p2 = await staking.getPositionInfo(user1.address, 1);
            expect(p2.earned).to.equal(MIN_INVESTMENT * 100n / 10000n); // 新仓位正常获息
        });

        it("Enforces MAX_POSITIONS (20) upper limit", async function () {
            await staking.connect(user1).register(ZERO);
            for (let i = 0; i < 20; i++) {
                await staking.connect(user1).invest(MIN_INVESTMENT);
            }
            expect(await staking.getPositionCount(user1.address)).to.equal(20);
            await expect(staking.connect(user1).invest(MIN_INVESTMENT))
                .to.be.revertedWith("Too many positions");
        });

        it("Paged settlement settles all users with no double pay", async function () {
            await staking.connect(owner).setSettlementBatchSize(2);

            const members = [user1, user2, user3, users[0], users[1]];
            for (const m of members) {
                await staking.connect(m).register(ZERO);
                await staking.connect(m).invest(MIN_INVESTMENT);
            }

            await time.increase(INTERVAL + 1);

            const total = Number(await staking.getUserCount());
            let cursor = Number(await staking.settlementCursor());
            let guard = 0;
            while (cursor < total && guard++ < 30) {
                await staking.connect(admin).dailySettlement(XMR_PRICE);
                cursor = Number(await staking.settlementCursor());
            }
            expect(cursor).to.be.gte(total);

            const expected = MIN_INVESTMENT * 100n / 10000n;
            for (const m of members) {
                const info = await staking.getUserInfo(m.address);
                expect(info.totalEarned).to.equal(expected); // 恰好 1%
                // 再次结算不重复发放
                expect((await staking.estimateStaticReward(m.address)).usdtValue).to.equal(0);
            }
        });

        it("batchImportPositions imports multi-position users with preserved balances", async function () {
            const parent = user1.address;
            const child = user2.address;

            await staking.batchImportPositions(
                [parent, child],                                  // users
                [ZERO, parent],                                   // referrers
                [1, 2],                                           // position counts
                [MIN_INVESTMENT, MIN_INVESTMENT, MIN_INVESTMENT], // principals
                [0, ethers.parseEther("50"), 0],                  // earneds
                [ethers.parseEther("10"), ethers.parseEther("20")], // pending USDT
                [ethers.parseEther("1"), ethers.parseEther("2")]    // pending XMR
            );

            const parentInfo = await staking.getUserInfo(parent);
            expect(parentInfo.personalAmount).to.equal(MIN_INVESTMENT);
            expect(parentInfo.pendingUSDT).to.equal(ethers.parseEther("10"));

            const childInfo = await staking.getUserInfo(child);
            expect(childInfo.personalAmount).to.equal(MIN_INVESTMENT * 2n);
            expect(childInfo.pendingUSDT).to.equal(ethers.parseEther("20"));
            expect(childInfo.pendingXMR).to.equal(ethers.parseEther("2"));

            expect(await staking.getPositionCount(child)).to.equal(2);
            const c0 = await staking.getPositionInfo(child, 0);
            expect(c0.earned).to.equal(ethers.parseEther("50"));
            const c1 = await staking.getPositionInfo(child, 1);
            expect(c1.principal).to.equal(MIN_INVESTMENT);
            expect(c1.closed).to.be.false;

            // 上级团队业绩 = 下级全部仓位本金
            expect(parentInfo.teamTotalVolume).to.equal(MIN_INVESTMENT * 2n);
            // 推荐关系
            const refs = await staking.getDirectReferrals(parent);
            expect(refs[0]).to.equal(child);
        });
    });

    describe("Configurable settlement interval (120s testnet cycle)", function () {
        let staking, usdt, xmrToken;

        beforeEach(async function () {
            [owner, admin, user1, ...users] = await ethers.getSigners();

            const MockUSDT = await ethers.getContractFactory("MockUSDT");
            usdt = await MockUSDT.deploy();
            await usdt.waitForDeployment();

            const XMRToken = await ethers.getContractFactory("XMRToken");
            xmrToken = await XMRToken.deploy();
            await xmrToken.waitForDeployment();

            const StakingDApp = await ethers.getContractFactory("StakingDApp");
            // 2 分钟一个周期
            staking = await StakingDApp.deploy(await usdt.getAddress(), await xmrToken.getAddress(), 120);
            await staking.waitForDeployment();
            await xmrToken.setMinter(await staking.getAddress());

            await usdt.mint(user1.address, ethers.parseEther("1000000"));
            await usdt.connect(user1).approve(await staking.getAddress(), ethers.MaxUint256);
        });

        it("settlementInterval=120 but every period = 1 day (1% per period)", async function () {
            expect(await staking.settlementInterval()).to.equal(120);
            // 每周期 = 1 天：最大补领 30 个周期（30 天收益）
            expect(await staking.maxClaimPeriods()).to.equal(30);

            await staking.connect(user1).register(ZERO);
            await staking.connect(user1).invest(MIN_INVESTMENT);

            // 前进 1 个周期（120s = 1 天）：直接发放日化 1% = 100 × 1% = 1 USDT
            await time.increase(120 + 1);
            await staking.connect(user1).claimStaticReward();

            const after = await staking.getPositionInfo(user1.address, 0);
            expect(after.earned).to.equal(ethers.parseEther("1"));

            // 跨 30+ 周期未结算 → 只补发 30 个周期（30 天）收益
            await time.increase(120 * 100);
            await staking.connect(user1).claimStaticReward();
            const afterCatchUp = await staking.getPositionInfo(user1.address, 0);
            expect(afterCatchUp.earned).to.equal(ethers.parseEther("31")); // 1 + 30
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
