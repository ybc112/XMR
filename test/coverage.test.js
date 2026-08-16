const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
    ONE_DAY, ZERO, E18,
    deployContracts, setupUser, registerAndInvest, advanceDays
} = require("./helpers");

describe("Coverage Enhancement Tests", function () {
    let staking, usdt, xmrToken, owner, admin, signers;
    const MIN100 = ethers.parseEther("100");

    async function freshSetup() {
        ({ staking, usdt, xmrToken, owner, admin, signers } = await deployContracts());
        for (const s of signers.slice(0, 20)) {
            await setupUser(usdt, staking, s);
        }
        await staking.connect(admin).dailySettlement(ethers.parseEther("100"));
        return { staking, usdt, xmrToken, owner, admin, signers };
    }

    describe("MultiSigWallet Extended", function () {
        let multiSig, owners;

        beforeEach(async function () {
            await freshSetup();
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            owners = [signers[0].address, signers[1].address, signers[2].address, signers[3].address];
            multiSig = await MultiSigWallet.deploy(owners, 2);
            await multiSig.waitForDeployment();
        });

        it("Should accept ETH deposits", async function () {
            await signers[4].sendTransaction({
                to: await multiSig.getAddress(),
                value: ethers.parseEther("1")
            });
            const balance = await ethers.provider.getBalance(await multiSig.getAddress());
            expect(balance).to.equal(ethers.parseEther("1"));
        });

        it("Should get all owners", async function () {
            const allOwners = await multiSig.getOwners();
            expect(allOwners.length).to.equal(4);
            expect(allOwners[0]).to.equal(owners[0]);
        });

        it("Should get transaction count (pending and executed)", async function () {
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            const pendingCount = await multiSig.getTransactionCount(true, false);
            expect(pendingCount).to.equal(1);
            const executedCount = await multiSig.getTransactionCount(false, true);
            expect(executedCount).to.equal(0);
        });

        it("Should add owner via wallet transaction", async function () {
            await staking.transferOwnership(await multiSig.getAddress());
            const newOwner = signers[4].address;
            const calldata = multiSig.interface.encodeFunctionData("addOwner", [newOwner]);
            await multiSig.connect(signers[0]).submitTransaction(
                await multiSig.getAddress(), 0, calldata
            );
            await multiSig.connect(signers[1]).confirmTransaction(0);
            expect(await multiSig.isOwner(newOwner)).to.be.true;
        });

        it("Should remove owner via wallet transaction", async function () {
            await staking.transferOwnership(await multiSig.getAddress());
            const target = signers[3].address;
            const calldata = multiSig.interface.encodeFunctionData("removeOwner", [target]);
            await multiSig.connect(signers[0]).submitTransaction(
                await multiSig.getAddress(), 0, calldata
            );
            await multiSig.connect(signers[1]).confirmTransaction(0);
            expect(await multiSig.isOwner(target)).to.be.false;
        });

        it("Should change requirement via wallet transaction", async function () {
            await staking.transferOwnership(await multiSig.getAddress());
            const calldata = multiSig.interface.encodeFunctionData("changeRequirement", [3]);
            await multiSig.connect(signers[0]).submitTransaction(
                await multiSig.getAddress(), 0, calldata
            );
            await multiSig.connect(signers[1]).confirmTransaction(0);
            expect(await multiSig.required()).to.equal(3);
        });

        it("Should reject duplicate owner in constructor", async function () {
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            await expect(MultiSigWallet.deploy([owners[0], owners[0]], 1))
                .to.be.revertedWith("MultiSig: duplicate owner");
        });

        it("Should reject zero address owner in constructor", async function () {
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            await expect(MultiSigWallet.deploy([ZERO, owners[1]], 1))
                .to.be.revertedWith("MultiSig: zero address");
        });

        it("Should reject empty owners array", async function () {
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            await expect(MultiSigWallet.deploy([], 1))
                .to.be.revertedWith("MultiSig: owners required");
        });

        it("Should reject required > owners length", async function () {
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            await expect(MultiSigWallet.deploy(owners, 5))
                .to.be.revertedWith("MultiSig: invalid required");
        });

        it("Should reject required = 0", async function () {
            const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
            await expect(MultiSigWallet.deploy(owners, 0))
                .to.be.revertedWith("MultiSig: invalid required");
        });

        it("Should reject confirmation from non-owner", async function () {
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            await expect(multiSig.connect(signers[4]).confirmTransaction(0))
                .to.be.revertedWith("MultiSig: owner not exists");
        });

        it("Should reject double confirmation", async function () {
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            await expect(multiSig.connect(signers[0]).confirmTransaction(0))
                .to.be.revertedWith("MultiSig: tx already confirmed");
        });

        it("Should reject revoke from non-confirmer", async function () {
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            await expect(multiSig.connect(signers[1]).revokeConfirmation(0))
                .to.be.revertedWith("MultiSig: tx not confirmed");
        });

        it("Should reject revoke on non-existent transaction", async function () {
            await expect(multiSig.connect(signers[0]).revokeConfirmation(99))
                .to.be.revertedWith("MultiSig: tx not confirmed");
        });

        it("Should reject revoke on executed transaction", async function () {
            await staking.transferOwnership(await multiSig.getAddress());
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            await multiSig.connect(signers[1]).confirmTransaction(0);
            await expect(multiSig.connect(signers[0]).revokeConfirmation(0))
                .to.be.revertedWith("MultiSig: tx already executed");
        });

        it("Should reject execute from non-owner", async function () {
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            await expect(multiSig.connect(signers[4]).executeTransaction(0))
                .to.be.revertedWith("MultiSig: owner not exists");
        });

        it("Should reject execute on non-existent transaction", async function () {
            await expect(multiSig.connect(signers[0]).executeTransaction(99))
                .to.be.revertedWith("MultiSig: tx not confirmed");
        });

        it("Should check isConfirmed status", async function () {
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            expect(await multiSig.isConfirmed(0)).to.be.false;
            await multiSig.connect(signers[1]).confirmTransaction(0);
            expect(await multiSig.isConfirmed(0)).to.be.true;
        });

        it("Should handle direct executeTransaction call", async function () {
            await staking.transferOwnership(await multiSig.getAddress());
            const calldata = staking.interface.encodeFunctionData("setDailyRate", [500]);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, calldata
            );
            await multiSig.connect(signers[1]).confirmTransaction(0);
            expect(await staking.dailyRate()).to.equal(500);
        });

        it("Should add owner that already exists (revert)", async function () {
            await staking.transferOwnership(await multiSig.getAddress());
            const calldata = multiSig.interface.encodeFunctionData("addOwner", [owners[0]]);
            await multiSig.connect(signers[0]).submitTransaction(
                await multiSig.getAddress(), 0, calldata
            );
            await multiSig.connect(signers[1]).confirmTransaction(0);
            const tx = await multiSig.getTransaction(0);
            expect(tx.executed).to.be.false;
        });

        it("Should handle failed execution gracefully", async function () {
            const badCalldata = ethers.randomBytes(64);
            await multiSig.connect(signers[0]).submitTransaction(
                await staking.getAddress(), 0, badCalldata
            );
            await multiSig.connect(signers[1]).confirmTransaction(0);
            const tx = await multiSig.getTransaction(0);
            expect(tx.executed).to.be.false;
        });
    });

    describe("StakingDApp Edge Coverage", function () {
        beforeEach(freshSetup);

        it("Should handle exit limit exactly 0 (remaining becomes 0)", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("100"));
            await staking.setDailyRate(10000);
            await advanceDays(2);
            await staking.connect(root).claimStaticReward();
            const remaining = await staking.getRemainingExitLimit(root.address);
            expect(remaining).to.equal(ethers.parseEther("100"));

            await registerAndInvest(staking, child, root.address, ethers.parseEther("1000"));
            const afterChild = await staking.getUserInfo(root.address);
            expect(afterChild.exited).to.be.true;

            const finalRemaining = await staking.getRemainingExitLimit(root.address);
            expect(finalRemaining).to.equal(0);
        });

        it("Should return 0 remaining for user with 0 exit limit", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            const remaining = await staking.getRemainingExitLimit(u.address);
            expect(remaining).to.equal(0);
        });

        it("Should return 0 estimate for exited user", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("100"));
            await staking.setDailyRate(10000);
            for (let i = 0; i < 3; i++) {
                await advanceDays(1);
                await staking.connect(u).claimStaticReward();
            }
            expect((await staking.getUserInfo(u.address)).exited).to.be.true;
            const [usdtVal, xmrVal] = await staking.estimateStaticReward(u.address);
            expect(usdtVal).to.equal(0);
            expect(xmrVal).to.equal(0);
        });

        it("Should return 0 estimate for below-minimum user", async function () {
            const u = signers[0];
            await staking.connect(u).register(ZERO);
            const [usdtVal] = await staking.estimateStaticReward(u.address);
            expect(usdtVal).to.equal(0);
        });

        it("Should return 0 estimate for same-day (0 days passed)", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            const [usdtVal] = await staking.estimateStaticReward(u.address);
            expect(usdtVal).to.equal(0);
        });

        it("Should handle estimate with 0 days passed correctly", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, MIN100);
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const [usdtVal, xmrVal] = await staking.estimateStaticReward(u.address);
            expect(usdtVal).to.equal(0);
            expect(xmrVal).to.equal(0);
        });

        it("Should get direct referrals list", async function () {
            const root = signers[0];
            await staking.connect(root).register(ZERO);
            await staking.connect(signers[1]).register(root.address);
            await staking.connect(signers[2]).register(root.address);
            const refs = await staking.getDirectReferrals(root.address);
            expect(refs.length).to.equal(2);
        });

        it("Should reject level info for invalid level", async function () {
            await expect(staking.getLevelInfo(0)).to.be.revertedWith("Invalid level");
            await expect(staking.getLevelInfo(10)).to.be.revertedWith("Invalid level");
        });

        it("Should reject generation rate for invalid generation", async function () {
            await expect(staking.setGenerationRate(12, 100)).to.be.revertedWith("Invalid generation");
        });

        it("Should reject generation rate above 100%", async function () {
            await expect(staking.setGenerationRate(0, 10001)).to.be.revertedWith("Rate exceeds 100%");
        });

        it("Should reject withdraw fee above 100%", async function () {
            await expect(staking.setWithdrawFee(10001)).to.be.revertedWith("Fee exceeds 100%");
        });

        it("Should reject invalid level threshold index", async function () {
            await expect(staking.setLevelThresholds(9, 100, 100, 100)).to.be.revertedWith("Invalid level index");
        });

        it("Should reject level threshold rate above 100%", async function () {
            await expect(staking.setLevelThresholds(0, 100, 100, 10001)).to.be.revertedWith("Rate exceeds 100%");
        });

        it("Should reject addAdmin with zero address", async function () {
            await expect(staking.addAdmin(ZERO)).to.be.revertedWith("Zero address");
        });

        it("Should withdraw arbitrary token", async function () {
            const amount = ethers.parseEther("1000");
            await usdt.mint(owner.address, amount);
            await usdt.transfer(await staking.getAddress(), amount);
            const before = await usdt.balanceOf(owner.address);
            await staking.withdrawToken(await usdt.getAddress(), owner.address, amount);
            const after = await usdt.balanceOf(owner.address);
            expect(after - before).to.equal(amount);
        });

        it("Should handle XMR withdrawal with exactly 0 fee when fee rate is 0", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("100000"));
            await staking.connect(u).setXMRAddress("4" + "B".repeat(94));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            await staking.setWithdrawFee(0);
            const xmrAmount = (await staking.getUserInfo(u.address)).pendingXMR;
            await staking.connect(u).requestXMRWithdrawal(xmrAmount);
            const info = await staking.getUserInfo(u.address);
            expect(info.xmrWithdrawalPending).to.equal(xmrAmount);
        });

        it("Should handle flash exchange with price change", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(1);
            await staking.connect(u).claimStaticReward();
            const xmrBefore = (await staking.getUserInfo(u.address)).pendingXMR;
            await staking.connect(admin).setXMRPrice(ethers.parseEther("200"));
            await staking.connect(u).flashExchange(xmrBefore);
            const info = await staking.getUserInfo(u.address);
            expect(info.pendingUSDT).to.equal(xmrBefore * ethers.parseEther("200") / E18);
        });

        it("Should handle invest after exit clearing pendingXMR", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("100"));
            await staking.setDailyRate(10000);
            for (let i = 0; i < 3; i++) {
                await advanceDays(1);
                await staking.connect(u).claimStaticReward();
            }
            const exitedInfo = await staking.getUserInfo(u.address);
            expect(exitedInfo.exited).to.be.true;
            expect(exitedInfo.pendingXMR).to.be.gt(0);
            await staking.connect(u).invest(MIN100);
            const info = await staking.getUserInfo(u.address);
            expect(info.exited).to.be.false;
            expect(info.totalEarned).to.equal(0);
            expect(info.pendingXMR).to.equal(0);
            expect(info.pendingUSDT).to.equal(0);
            expect(info.xmrWithdrawalPending).to.equal(0);
        });

        it("Should handle team reward chain with blacklisted ancestor", async function () {
            const root = signers[0];
            const mid = signers[1];
            const leaf = signers[2];
            await registerAndInvest(staking, root, ZERO, ethers.parseEther("10000"));
            await registerAndInvest(staking, signers[3], root.address, ethers.parseEther("25000"));
            await registerAndInvest(staking, signers[4], root.address, ethers.parseEther("25000"));
            await registerAndInvest(staking, mid, root.address, ethers.parseEther("500"));
            for (let i = 5; i <= 8; i++) {
                await registerAndInvest(staking, signers[i], mid.address, ethers.parseEther("2000"));
            }
            await staking.setBlacklist(root.address, true);
            const rootBefore = (await staking.getUserInfo(root.address)).pendingUSDT;
            const midBefore = (await staking.getUserInfo(mid.address)).pendingUSDT;
            await registerAndInvest(staking, leaf, mid.address, ethers.parseEther("1000"));
            const rootAfter = (await staking.getUserInfo(root.address)).pendingUSDT;
            const midAfter = (await staking.getUserInfo(mid.address)).pendingUSDT;
            expect(rootAfter).to.equal(rootBefore);
            expect(midAfter - midBefore).to.be.gt(0);
        });

        it("Should handle claim with exactly MAX_CLAIM_DAYS (30)", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(30);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            expect(info.totalEarned).to.equal(ethers.parseEther("300"));
        });

        it("Should handle claim with 31 days (capped at 30)", async function () {
            const u = signers[0];
            await registerAndInvest(staking, u, ZERO, ethers.parseEther("1000"));
            await advanceDays(31);
            await staking.connect(u).claimStaticReward();
            const info = await staking.getUserInfo(u.address);
            expect(info.totalEarned).to.equal(ethers.parseEther("300"));
        });

        it("Should handle USDT withdrawal with insufficient contract balance", async function () {
            const root = signers[0];
            const child = signers[1];
            await registerAndInvest(staking, root, ZERO, MIN100);
            await registerAndInvest(staking, child, root.address, MIN100);
            await staking.withdrawFees(owner.address, (await usdt.balanceOf(await staking.getAddress())));
            const reward = (await staking.getUserInfo(root.address)).pendingUSDT;
            await expect(staking.connect(root).withdrawUSDT(reward))
                .to.be.revertedWith("Insufficient contract USDT");
        });
    });
});
