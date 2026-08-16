// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./XMRToken.sol";

contract StakingDApp is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct User {
        address referrer;
        uint256 personalAmount;
        uint256 totalEarned;
        uint256 exitLimit;
        bool isBlacklisted;
        bool isRegistered;
        bool exited;
        uint256 registerTime;
        uint256 lastClaimDay;
        uint256 teamTotalVolume;
        uint256 maxAreaVolume;
        uint8 level;
        uint256 pendingUSDT;
        uint256 pendingXMR;
        uint256 xmrWithdrawalPending;
    }

    struct LevelInfo {
        uint256 personalRequired;
        uint256 subAreaRequired;
        uint256 teamRate;
    }

    IERC20 public usdtToken;
    XMRToken public xmrToken;

    uint256 public xmrPrice;
    uint256 public dailyRate = 100;
    uint256 public computingPower = 100;
    uint256 public withdrawFee = 500;
    uint256 public constant EXIT_MULTIPLIER = 3;
    uint256 public constant MIN_INVESTMENT = 100 * 10 ** 18;
    uint256 public constant MAX_GENERATIONS = 12;
    uint256 public constant MAX_TEAM_DEPTH = 50;
    uint256 public constant XMR_WITHDRAWAL_MIN = 0.05 * 10 ** 18;
    uint256 public constant DAY_SECONDS = 86400;
    uint256 public constant MAX_CLAIM_DAYS = 30;
    uint256 public constant WITHDRAW_UNIT = 10 * 10 ** 18;

    bool public paused;

    LevelInfo[9] public levels;
    uint256[12] public generationRates;

    mapping(address => User) public users;
    mapping(address => address[]) public directReferrals;
    mapping(address => mapping(address => uint256)) public directReferralVolume;
    mapping(address => bool) public admins;
    mapping(address => uint256) public addressToMemberId;
    mapping(uint256 => address) public memberIdToAddress;
    mapping(address => string) public xmrAddress;
    mapping(address => uint256) public userComputingPower;

    uint256 public nextMemberId = 10001;
    uint256 public lastSettlementDay;
    uint256 public totalUSDTDeposited;
    uint256 public totalUsers;

    event Registered(address indexed user, address indexed referrer, uint256 memberId);
    event Invested(address indexed user, uint256 amount, uint256 totalPersonal);
    event StaticRewardClaimed(address indexed user, uint256 usdtValue, uint256 xmrAmount);
    event GenerationReward(address indexed receiver, address indexed investor, uint8 generation, uint256 amount);
    event TeamReward(address indexed receiver, address indexed investor, uint8 level, uint256 amount);
    event Exited(address indexed user, uint256 totalEarned);
    event USDTWithdrawn(address indexed user, uint256 amount, uint256 fee);
    event XMRWithdrawalRequested(address indexed user, uint256 amount, uint256 fee, string xmrAddr);
    event XMRWithdrawalProcessed(address indexed user, uint256 amount);
    event FlashExchanged(address indexed user, uint256 xmrAmount, uint256 usdtAmount);
    event DailySettlement(uint256 day, uint256 xmrPrice);
    event BlacklistUpdated(address indexed user, bool status);
    event Paused();
    event Unpaused();
    event AdminUpdated(address indexed admin, bool status);
    event DailyRateUpdated(uint256 oldRate, uint256 newRate);
    event ComputingPowerUpdated(uint256 oldPower, uint256 newPower);
    event WithdrawFeeUpdated(uint256 oldFee, uint256 newFee);
    event XMRPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event LevelUpdated(address indexed user, uint8 oldLevel, uint8 newLevel);
    event XMRAddressSet(address indexed user, string xmrAddr);
    event UserComputingPowerSet(address indexed user, uint256 power);
    event BalanceAdjusted(address indexed user, string kind, int256 delta, address operator);

    constructor(address _usdt, address _xmr) Ownable(msg.sender) {
        usdtToken = IERC20(_usdt);
        xmrToken = XMRToken(_xmr);

        levels[0] = LevelInfo(200 * 10 ** 18, 5_000 * 10 ** 18, 500);
        levels[1] = LevelInfo(500 * 10 ** 18, 20_000 * 10 ** 18, 1000);
        levels[2] = LevelInfo(1_000 * 10 ** 18, 80_000 * 10 ** 18, 1500);
        levels[3] = LevelInfo(2_000 * 10 ** 18, 200_000 * 10 ** 18, 2000);
        levels[4] = LevelInfo(3_000 * 10 ** 18, 500_000 * 10 ** 18, 2500);
        levels[5] = LevelInfo(5_000 * 10 ** 18, 1_000_000 * 10 ** 18, 3000);
        levels[6] = LevelInfo(10_000 * 10 ** 18, 2_000_000 * 10 ** 18, 3500);
        levels[7] = LevelInfo(15_000 * 10 ** 18, 5_000_000 * 10 ** 18, 4000);
        levels[8] = LevelInfo(20_000 * 10 ** 18, 10_000_000 * 10 ** 18, 4500);

        generationRates = [1000, 300, 200, 100, 100, 100, 100, 100, 100, 100, 100, 100];

        xmrPrice = 100 * 10 ** 18;
    }

    modifier notPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier notBlacklisted() {
        require(!users[msg.sender].isBlacklisted, "User is blacklisted");
        _;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender] || msg.sender == owner(), "Not admin");
        _;
    }

    function register(address _referrer) external notPaused {
        require(!users[msg.sender].isRegistered, "Already registered");
        require(msg.sender != _referrer, "Cannot refer self");

        if (_referrer != address(0)) {
            require(users[_referrer].isRegistered, "Referrer not registered");
        }

        // 会员 ID 随机生成（10001 ~ 1010000），非顺序递增
        uint256 salt = nextMemberId++;
        uint256 memberId;
        do {
            memberId = 10001 + uint256(keccak256(abi.encodePacked(
                block.prevrandao, block.timestamp, msg.sender, salt++
            ))) % 999999;
        } while (memberIdToAddress[memberId] != address(0));
        users[msg.sender].isRegistered = true;
        users[msg.sender].referrer = _referrer;
        users[msg.sender].registerTime = block.timestamp;
        users[msg.sender].lastClaimDay = block.timestamp / DAY_SECONDS;

        addressToMemberId[msg.sender] = memberId;
        memberIdToAddress[memberId] = msg.sender;

        if (_referrer != address(0)) {
            directReferrals[_referrer].push(msg.sender);
        }

        totalUsers += 1;
        emit Registered(msg.sender, _referrer, memberId);
    }

    function invest(uint256 _amount) external nonReentrant notPaused notBlacklisted {
        require(_amount >= MIN_INVESTMENT, "Investment below 100 USDT");
        require(_amount % MIN_INVESTMENT == 0, "Investment must be multiple of 100");
        require(users[msg.sender].isRegistered, "Not registered");

        User storage user = users[msg.sender];

        if (user.exited) {
            user.personalAmount = _amount;
            user.totalEarned = 0;
            user.pendingUSDT = 0;
            user.pendingXMR = 0;
            user.xmrWithdrawalPending = 0;
            user.exited = false;
        } else {
            user.personalAmount += _amount;
        }
        user.exitLimit = user.personalAmount * EXIT_MULTIPLIER;

        usdtToken.safeTransferFrom(msg.sender, address(this), _amount);
        totalUSDTDeposited += _amount;

        _checkAndSetLevel(msg.sender);
        _updateTeamVolumesAndLevels(msg.sender, _amount);
        _distributeRewards(msg.sender, _amount);

        emit Invested(msg.sender, _amount, user.personalAmount);
    }

    function claimStaticReward() external nonReentrant notPaused notBlacklisted {
        User storage user = users[msg.sender];
        require(user.isRegistered, "Not registered");
        require(user.personalAmount >= MIN_INVESTMENT, "Below min investment");
        require(!user.exited, "User exited");
        require(xmrPrice > 0, "XMR price not set");

        uint256 currentDay = block.timestamp / DAY_SECONDS;
        uint256 daysPassed = currentDay - user.lastClaimDay;
        require(daysPassed > 0, "Already claimed today");
        if (daysPassed > MAX_CLAIM_DAYS) daysPassed = MAX_CLAIM_DAYS;

        user.lastClaimDay = currentDay;

        uint256 power = userComputingPower[msg.sender] > 0 ? userComputingPower[msg.sender] : computingPower;
        uint256 effectiveRate = dailyRate * power / 100;
        uint256 usdtReward = user.personalAmount * effectiveRate * daysPassed / 10000;

        uint256 cappedReward = _applyExitLimit(msg.sender, usdtReward);
        if (cappedReward == 0) return;

        uint256 xmrReward = cappedReward * 10 ** 18 / xmrPrice;
        if (xmrReward > 0) {
            xmrToken.mint(address(this), xmrReward);
            user.pendingXMR += xmrReward;
        }

        user.totalEarned += cappedReward;

        // 团队奖：伞下账户领取静态收益时，沿推荐链按级差/平级/超越规则分配（XMR 记账）
        _distributeTeamRewards(msg.sender, cappedReward);

        emit StaticRewardClaimed(msg.sender, cappedReward, xmrReward);

        if (user.totalEarned >= user.exitLimit) {
            user.exited = true;
            emit Exited(msg.sender, user.totalEarned);
        }
    }

    function flashExchange(uint256 _xmrAmount) external nonReentrant notPaused notBlacklisted {
        require(_xmrAmount > 0, "Amount must be > 0");
        require(xmrPrice > 0, "XMR price not set");

        User storage user = users[msg.sender];
        require(user.pendingXMR >= _xmrAmount, "Insufficient XMR balance");

        uint256 usdtAmount = _xmrAmount * xmrPrice / 10 ** 18;

        user.pendingXMR -= _xmrAmount;
        user.pendingUSDT += usdtAmount;

        xmrToken.burn(_xmrAmount);

        emit FlashExchanged(msg.sender, _xmrAmount, usdtAmount);
    }

    function withdrawUSDT(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(_amount % WITHDRAW_UNIT == 0, "Withdrawal must be multiple of 10");

        User storage user = users[msg.sender];
        require(user.pendingUSDT >= _amount, "Insufficient balance");

        uint256 fee = _amount * withdrawFee / 10000;
        uint256 actual = _amount - fee;

        user.pendingUSDT -= _amount;

        require(usdtToken.balanceOf(address(this)) >= actual, "Insufficient contract USDT");
        usdtToken.safeTransfer(msg.sender, actual);

        emit USDTWithdrawn(msg.sender, actual, fee);
    }

    function setXMRAddress(string calldata _addr) external {
        require(bytes(_addr).length >= 90 && bytes(_addr).length <= 110, "Invalid XMR address length");
        xmrAddress[msg.sender] = _addr;
        emit XMRAddressSet(msg.sender, _addr);
    }

    function requestXMRWithdrawal(uint256 _amount) external nonReentrant {
        require(_amount >= XMR_WITHDRAWAL_MIN, "Below minimum withdrawal");
        require(bytes(xmrAddress[msg.sender]).length > 0, "XMR address not set");

        User storage user = users[msg.sender];
        require(user.pendingXMR >= _amount, "Insufficient XMR balance");

        uint256 fee = _amount * withdrawFee / 10000;
        uint256 actual = _amount - fee;

        user.pendingXMR -= _amount;
        user.xmrWithdrawalPending += actual;

        if (fee > 0) {
            xmrToken.burn(fee);
        }

        emit XMRWithdrawalRequested(msg.sender, actual, fee, xmrAddress[msg.sender]);
    }

    function dailySettlement(uint256 _xmrPrice) external onlyAdmin {
        require(_xmrPrice > 0, "Price must be > 0");
        uint256 currentDay = block.timestamp / DAY_SECONDS;
        lastSettlementDay = currentDay;
        xmrPrice = _xmrPrice;
        emit DailySettlement(currentDay, _xmrPrice);
    }

    function setXMRPrice(uint256 _price) external onlyAdmin {
        require(_price > 0, "Price must be > 0");
        emit XMRPriceUpdated(xmrPrice, _price);
        xmrPrice = _price;
    }

    function processXMRWithdrawal(address _user) external onlyAdmin nonReentrant {
        User storage user = users[_user];
        uint256 amount = user.xmrWithdrawalPending;
        require(amount > 0, "No pending withdrawal");
        require(xmrToken.balanceOf(address(this)) >= amount, "Insufficient XMR in contract");

        user.xmrWithdrawalPending = 0;
        xmrToken.transfer(_user, amount);

        emit XMRWithdrawalProcessed(_user, amount);
    }

    function setDailyRate(uint256 _rate) external onlyOwner {
        require(_rate <= 10000, "Rate exceeds 100%");
        emit DailyRateUpdated(dailyRate, _rate);
        dailyRate = _rate;
    }

    function setComputingPower(uint256 _power) external onlyOwner {
        emit ComputingPowerUpdated(computingPower, _power);
        computingPower = _power;
    }

    function setUserComputingPower(address _user, uint256 _power) external onlyOwner {
        require(_power <= 10000, "Power too high");
        userComputingPower[_user] = _power;
        emit UserComputingPowerSet(_user, _power);
    }

    function adjustUserUSDT(address _user, int256 _delta) external onlyOwner {
        User storage u = users[_user];
        if (_delta > 0) {
            u.pendingUSDT += uint256(_delta);
        } else {
            uint256 d = uint256(-_delta);
            u.pendingUSDT = u.pendingUSDT > d ? u.pendingUSDT - d : 0;
        }
        emit BalanceAdjusted(_user, "USDT", _delta, msg.sender);
    }

    function adjustUserXMR(address _user, int256 _delta) external onlyOwner {
        User storage u = users[_user];
        if (_delta > 0) {
            xmrToken.mint(address(this), uint256(_delta));
            u.pendingXMR += uint256(_delta);
        } else {
            uint256 d = uint256(-_delta);
            u.pendingXMR = u.pendingXMR > d ? u.pendingXMR - d : 0;
        }
        emit BalanceAdjusted(_user, "XMR", _delta, msg.sender);
    }

    function setWithdrawFee(uint256 _fee) external onlyOwner {
        require(_fee <= 10000, "Fee exceeds 100%");
        emit WithdrawFeeUpdated(withdrawFee, _fee);
        withdrawFee = _fee;
    }

    function setBlacklist(address _user, bool _status) external onlyOwner {
        users[_user].isBlacklisted = _status;
        emit BlacklistUpdated(_user, _status);
    }

    function emergencyPause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function emergencyUnpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function addAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), "Zero address");
        admins[_admin] = true;
        emit AdminUpdated(_admin, true);
    }

    function removeAdmin(address _admin) external onlyOwner {
        admins[_admin] = false;
        emit AdminUpdated(_admin, false);
    }

    function setLevelThresholds(
        uint8 _index,
        uint256 _personalRequired,
        uint256 _subAreaRequired,
        uint256 _teamRate
    ) external onlyOwner {
        require(_index < 9, "Invalid level index");
        require(_teamRate <= 10000, "Rate exceeds 100%");
        levels[_index] = LevelInfo(_personalRequired, _subAreaRequired, _teamRate);
    }

    function setGenerationRate(uint8 _generation, uint256 _rate) external onlyOwner {
        require(_generation < 12, "Invalid generation");
        require(_rate <= 10000, "Rate exceeds 100%");
        generationRates[_generation] = _rate;
    }

    function withdrawFees(address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "Zero address");
        require(_amount > 0, "Amount must be > 0");
        require(usdtToken.balanceOf(address(this)) >= _amount, "Insufficient USDT balance");
        usdtToken.safeTransfer(_to, _amount);
    }

    function withdrawToken(address _token, address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "Zero address");
        require(_amount > 0, "Amount must be > 0");
        require(IERC20(_token).balanceOf(address(this)) >= _amount, "Insufficient token balance");
        IERC20(_token).safeTransfer(_to, _amount);
    }

    function _updateTeamVolumesAndLevels(address _user, uint256 _amount) internal {
        address current = users[_user].referrer;
        address child = _user;
        uint256 depth = 0;

        while (current != address(0) && depth < MAX_TEAM_DEPTH) {
            users[current].teamTotalVolume += _amount;
            directReferralVolume[current][child] += _amount;

            if (directReferralVolume[current][child] > users[current].maxAreaVolume) {
                users[current].maxAreaVolume = directReferralVolume[current][child];
            }

            _checkAndSetLevel(current);

            child = current;
            current = users[current].referrer;
            depth += 1;
        }
    }

    function _checkAndSetLevel(address _user) internal {
        User storage user = users[_user];
        uint256 subArea = user.teamTotalVolume - user.maxAreaVolume;
        uint8 oldLevel = user.level;
        uint8 newLevel = 0;

        for (uint8 i = 9; i >= 1; i--) {
            if (
                user.personalAmount >= levels[i - 1].personalRequired &&
                subArea >= levels[i - 1].subAreaRequired
            ) {
                newLevel = i;
                break;
            }
        }

        if (newLevel != oldLevel) {
            user.level = newLevel;
            emit LevelUpdated(_user, oldLevel, newLevel);
        }
    }

    /// 12 代推荐奖（按投资额基数，投资时分配）
    function _distributeRewards(address _user, uint256 _amount) internal {
        address current = users[_user].referrer;
        uint256 depth = 0;

        while (current != address(0) && depth < MAX_TEAM_DEPTH) {
            User storage ancestor = users[current];

            if (depth < MAX_GENERATIONS) {
                if (
                    ancestor.personalAmount >= MIN_INVESTMENT &&
                    !ancestor.exited &&
                    !ancestor.isBlacklisted
                ) {
                    uint256 genReward = _amount * generationRates[depth] / 10000;
                    genReward = _applyExitLimit(current, genReward);

                    if (genReward > 0) {
                        ancestor.pendingUSDT += genReward;
                        ancestor.totalEarned += genReward;
                        emit GenerationReward(current, _user, uint8(depth + 1), genReward);

                        if (ancestor.totalEarned >= ancestor.exitLimit) {
                            ancestor.exited = true;
                            emit Exited(current, ancestor.totalEarned);
                        }
                    }
                }
            }

            current = ancestor.referrer;
            depth += 1;
        }
    }

    /// 团队奖（按伞下账户静态收益基数，领取静态收益时分配，奖励以 XMR 记账）
    /// _baseValue 为该用户本次静态收益的 USDT 价值；上级按级差/平级/超越规则
    /// 抽取 _baseValue 的百分比，折算成 XMR 记入 pendingXMR
    function _distributeTeamRewards(address _user, uint256 _baseValue) internal {
        address current = users[_user].referrer;
        uint256 prevLevel = 0;
        uint256 prevRate = 0;
        uint256 prevReward = 0;
        uint256 depth = 0;

        while (current != address(0) && depth < MAX_TEAM_DEPTH) {
            User storage ancestor = users[current];

            if (ancestor.level > 0 && !ancestor.exited && !ancestor.isBlacklisted) {
                uint256 currentRate = levels[ancestor.level - 1].teamRate;
                uint256 teamReward = 0;

                if (ancestor.level > prevLevel) {
                    teamReward = _baseValue * (currentRate - prevRate) / 10000;
                } else if (ancestor.level == prevLevel) {
                    teamReward = prevReward * 1000 / 10000;
                } else {
                    teamReward = prevReward * 1000 / 10000;
                }

                teamReward = _applyExitLimit(current, teamReward);

                if (teamReward > 0) {
                    // 团队奖以 XMR 记账（与静态收益同币种）
                    uint256 xmrReward = teamReward * 10 ** 18 / xmrPrice;
                    if (xmrReward > 0) {
                        xmrToken.mint(address(this), xmrReward);
                        ancestor.pendingXMR += xmrReward;
                    }
                    ancestor.totalEarned += teamReward;
                    emit TeamReward(current, _user, ancestor.level, teamReward);

                    if (ancestor.totalEarned >= ancestor.exitLimit) {
                        ancestor.exited = true;
                        emit Exited(current, ancestor.totalEarned);
                    }
                }

                prevLevel = ancestor.level;
                prevRate = currentRate;
                prevReward = teamReward;
            } else {
                prevLevel = ancestor.level;
                prevRate = ancestor.level > 0 ? levels[ancestor.level - 1].teamRate : 0;
                prevReward = 0;
            }

            current = ancestor.referrer;
            depth += 1;
        }
    }

    function _applyExitLimit(address _user, uint256 _earnings) internal returns (uint256) {
        User storage user = users[_user];
        if (user.exited) return 0;
        if (user.exitLimit == 0) return 0;

        uint256 remaining = user.exitLimit > user.totalEarned
            ? user.exitLimit - user.totalEarned
            : 0;

        if (remaining == 0) {
            user.exited = true;
            emit Exited(_user, user.totalEarned);
            return 0;
        }

        uint256 actual = _earnings > remaining ? remaining : _earnings;
        return actual;
    }

    struct UserInfoView {
        address referrer;
        uint256 personalAmount;
        uint256 totalEarned;
        uint256 exitLimit;
        bool isBlacklisted;
        bool isRegistered;
        bool exited;
        uint8 level;
        uint256 pendingUSDT;
        uint256 pendingXMR;
        uint256 teamTotalVolume;
        uint256 maxAreaVolume;
        uint256 memberId;
        uint256 xmrWithdrawalPending;
        string xmrAddress;
    }

    function getUserInfo(address _user) external view returns (UserInfoView memory) {
        User storage user = users[_user];
        return UserInfoView({
            referrer: user.referrer,
            personalAmount: user.personalAmount,
            totalEarned: user.totalEarned,
            exitLimit: user.exitLimit,
            isBlacklisted: user.isBlacklisted,
            isRegistered: user.isRegistered,
            exited: user.exited,
            level: user.level,
            pendingUSDT: user.pendingUSDT,
            pendingXMR: user.pendingXMR,
            teamTotalVolume: user.teamTotalVolume,
            maxAreaVolume: user.maxAreaVolume,
            memberId: addressToMemberId[_user],
            xmrWithdrawalPending: user.xmrWithdrawalPending,
            xmrAddress: xmrAddress[_user]
        });
    }

    function getSubAreaVolume(address _user) external view returns (uint256) {
        User storage user = users[_user];
        return user.teamTotalVolume - user.maxAreaVolume;
    }

    function getDirectReferrals(address _user) external view returns (address[] memory) {
        return directReferrals[_user];
    }

    function getDirectReferralCount(address _user) external view returns (uint256) {
        return directReferrals[_user].length;
    }

    function getRemainingExitLimit(address _user) external view returns (uint256) {
        User storage user = users[_user];
        if (user.exited || user.exitLimit <= user.totalEarned) return 0;
        return user.exitLimit - user.totalEarned;
    }

    function getLevelInfo(uint8 _level) external view returns (
        uint256 personalRequired,
        uint256 subAreaRequired,
        uint256 teamRate
    ) {
        require(_level >= 1 && _level <= 9, "Invalid level");
        LevelInfo storage info = levels[_level - 1];
        return (info.personalRequired, info.subAreaRequired, info.teamRate);
    }

    struct ContractStatsView {
        uint256 totalUsers;
        uint256 totalUSDTDeposited;
        uint256 xmrPrice;
        uint256 dailyRate;
        uint256 computingPower;
        uint256 withdrawFee;
        bool paused;
        uint256 contractUSDTBalance;
        uint256 contractXMRBalance;
    }

    function getContractStats() external view returns (ContractStatsView memory) {
        return ContractStatsView({
            totalUsers: totalUsers,
            totalUSDTDeposited: totalUSDTDeposited,
            xmrPrice: xmrPrice,
            dailyRate: dailyRate,
            computingPower: computingPower,
            withdrawFee: withdrawFee,
            paused: paused,
            contractUSDTBalance: usdtToken.balanceOf(address(this)),
            contractXMRBalance: xmrToken.balanceOf(address(this))
        });
    }

    function estimateStaticReward(address _user) external view returns (
        uint256 usdtValue,
        uint256 xmrValue
    ) {
        User storage user = users[_user];
        if (user.exited || user.personalAmount < MIN_INVESTMENT) return (0, 0);

        uint256 currentDay = block.timestamp / DAY_SECONDS;
        uint256 daysPassed = currentDay - user.lastClaimDay;
        if (daysPassed == 0) return (0, 0);
        if (daysPassed > MAX_CLAIM_DAYS) daysPassed = MAX_CLAIM_DAYS;

        uint256 power = userComputingPower[_user] > 0 ? userComputingPower[_user] : computingPower;
        uint256 effectiveRate = dailyRate * power / 100;
        usdtValue = user.personalAmount * effectiveRate * daysPassed / 10000;

        uint256 remaining = user.exitLimit > user.totalEarned
            ? user.exitLimit - user.totalEarned
            : 0;
        if (usdtValue > remaining) usdtValue = remaining;

        if (xmrPrice > 0) {
            xmrValue = usdtValue * 10 ** 18 / xmrPrice;
        }
    }
}
