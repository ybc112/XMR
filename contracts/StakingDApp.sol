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

    /// 独立仓位：每次投资生成一个，各自记账、各自 3 倍出局
    struct Position {
        uint256 principal;        // 该仓位本金（≥100 且为 100 的整数倍）
        uint256 earned;           // 该仓位累计已赚（静态 + 动态，统一计入）
        uint256 lastClaimPeriod;  // 该仓位最后结算周期（补投时间不同，各自独立计算）
        bool closed;              // 是否已拿满 3 倍（停止产生收益）
    }

    struct PositionInfoView {
        uint256 principal;
        uint256 earned;
        uint256 lastClaimPeriod;
        bool closed;
        uint256 capacity;   // principal × 3
        uint256 remaining;  // capacity - earned
    }

    IERC20 public usdtToken;
    XMRToken public xmrToken;

    uint256 public xmrPrice;
    uint256 public withdrawFee = 500;
    uint256 public constant EXIT_MULTIPLIER = 3;
    uint256 public constant MIN_INVESTMENT = 100 * 10 ** 18;
    uint256 public constant MAX_GENERATIONS = 12;
    uint256 public constant MAX_TEAM_DEPTH = 50;
    uint256 public constant XMR_WITHDRAWAL_MIN = 0.05 * 10 ** 18;
    uint256 public constant DAY_SECONDS = 86400;
    uint256 public constant MAX_CLAIM_DAYS = 30;
    uint256 public constant WITHDRAW_UNIT = 10 * 10 ** 18;
    uint256 public constant DAILY_RATE = 100;
    uint256 public constant SETTLEMENT_ANCHOR = 1767240000;
    /// 单个仓位最多允许补领的周期数 = 30（每周期 = 1 天，共 30 天）
    uint256 public immutable maxClaimPeriods;
    /// 结算周期（秒）：构造参数，0/省略 = 24h（86400）；测试网可传 120（2 分钟）——此时每周期 = 1 天快速验证
    uint256 public immutable settlementInterval;
    /// 单账号最多仓位数量（超过后先清理已关闭仓位，仍满则拒绝新仓位）
    uint256 public constant MAX_POSITIONS = 20;

    bool public paused;

    LevelInfo[9] public levels;
    uint256[12] public generationRates;

    mapping(address => User) public users;
    /// 用户仓位列表，按投资时间顺序排列（invest / 收益 FIFO 填充 / 迁移导入使用）
    mapping(address => Position[]) internal positions;
    mapping(address => address[]) public directReferrals;
    mapping(address => mapping(address => uint256)) public directReferralVolume;
    mapping(address => bool) public admins;
    mapping(address => uint256) public addressToMemberId;
    mapping(uint256 => address) public memberIdToAddress;
    mapping(address => string) public xmrAddress;

    address[] private userList;
    uint256 public nextMemberId = 10001;
    uint256 public lastSettlementPeriod;
    /// 分页结算：本轮已处理到的用户索引（新周期自动归零）
    uint256 public settlementCursor;
    /// 分页结算每批用户数
    uint256 public settlementBatchSize = 50;
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
    event WithdrawFeeUpdated(uint256 oldFee, uint256 newFee);
    event XMRPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event LevelUpdated(address indexed user, uint8 oldLevel, uint8 newLevel);
    event XMRAddressSet(address indexed user, string xmrAddr);
    event BalanceAdjusted(address indexed user, string kind, int256 delta, address operator);
    /// 单仓位拿满 3 倍出局
    event PositionClosed(address indexed user, uint256 index, uint256 principal, uint256 earned);

    constructor(address _usdt, address _xmr, uint256 _settlementInterval) Ownable(msg.sender) {
        usdtToken = IERC20(_usdt);
        xmrToken = XMRToken(_xmr);

        // 结算周期：0/省略 = 24h（86400s），测试网可传短周期（如 600s = 10 分钟）快速验证
        settlementInterval = _settlementInterval == 0 ? DAY_SECONDS : _settlementInterval;
        // 每周期 = 1 天：最多补领 30 个周期（30 天收益）
        maxClaimPeriods = MAX_CLAIM_DAYS;

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
        users[msg.sender].lastClaimDay = _currentPeriod();
        userList.push(msg.sender);

        addressToMemberId[msg.sender] = memberId;
        memberIdToAddress[memberId] = msg.sender;

        if (_referrer != address(0)) {
            directReferrals[_referrer].push(msg.sender);
        }

        totalUsers += 1;
        emit Registered(msg.sender, _referrer, memberId);
    }

    /// 投资：每次调用生成一个**独立仓位**（不再合并本金），各自 3 倍出局
    function invest(uint256 _amount) external nonReentrant notPaused notBlacklisted {
        require(_amount >= MIN_INVESTMENT, "Investment below 100 USDT");
        require(_amount % MIN_INVESTMENT == 0, "Investment must be multiple of 100");
        require(users[msg.sender].isRegistered, "Not registered");

        User storage user = users[msg.sender];

        _compactClosedPositions(msg.sender);
        require(positions[msg.sender].length < MAX_POSITIONS, "Too many positions");

        positions[msg.sender].push(Position({
            principal: _amount,
            earned: 0,
            lastClaimPeriod: _currentPeriod(),
            closed: false
        }));

        // 出局后复投：历史仓位保留、未提取余额保留，账号重新激活
        user.exited = false;
        user.personalAmount += _amount;
        user.exitLimit = user.personalAmount * EXIT_MULTIPLIER;
        user.lastClaimDay = _currentPeriod();

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
        require(_currentPeriod() > user.lastClaimDay, "Already claimed today");

        _settleUser(msg.sender, _currentPeriod());
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

    function withdrawUSDT(uint256 _amount) external nonReentrant notBlacklisted {
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

    function requestXMRWithdrawal(uint256 _amount) external nonReentrant notBlacklisted {
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

    /// 分页结算：每笔交易只处理 settlementBatchSize 个用户；新周期自动重置游标并更新价格
    /// 后端需循环调用直到 settlementCursor >= getUserCount()
    function dailySettlement(uint256 _xmrPrice) external onlyAdmin nonReentrant {
        require(_xmrPrice > 0, "Price must be > 0");
        uint256 currentPeriod = _currentPeriod();
        if (currentPeriod > lastSettlementPeriod) {
            lastSettlementPeriod = currentPeriod;
            settlementCursor = 0;
            xmrPrice = _xmrPrice;
        }

        uint256 end = settlementCursor + settlementBatchSize;
        if (end > userList.length) end = userList.length;
        for (uint256 i = settlementCursor; i < end; i++) {
            _settleUser(userList[i], currentPeriod);
        }
        settlementCursor = end;

        emit DailySettlement(currentPeriod, xmrPrice);
    }

    function getUserCount() external view returns (uint256) {
        return userList.length;
    }

    /// 分页批次大小可调（仅 owner）
    function setSettlementBatchSize(uint256 _size) external onlyOwner {
        require(_size > 0 && _size <= 200, "Invalid batch size");
        settlementBatchSize = _size;
    }

    function _currentPeriod() internal view returns (uint256) {
        return block.timestamp >= SETTLEMENT_ANCHOR
            ? (block.timestamp - SETTLEMENT_ANCHOR) / settlementInterval
            : 0;
    }

    /// 多仓位静态收益结算：每个未关闭仓位独立累计（日化 1%，按周期长度缩放），各自封顶 3 倍本金
    function _settleUser(address _user, uint256 _targetPeriod) internal {
        User storage user = users[_user];
        if (user.isBlacklisted || user.exited || xmrPrice == 0) return;

        Position[] storage posList = positions[_user];
        uint256 totalReward = 0;
        bool anySettled = false;

        for (uint256 i = 0; i < posList.length; i++) {
            Position storage pos = posList[i];
            if (pos.closed) continue;
            if (_targetPeriod <= pos.lastClaimPeriod) continue;

            uint256 periodsPassed = _targetPeriod - pos.lastClaimPeriod;
            if (periodsPassed > maxClaimPeriods) periodsPassed = maxClaimPeriods;

            // 每周期 = 1 天：每周期发放日化 1%（不再按周期秒数缩放，测试网 2 分钟周期=1 天，每次即 1%）
            uint256 usdtReward = pos.principal * DAILY_RATE * periodsPassed
                / 10000;
            uint256 cap = pos.principal * EXIT_MULTIPLIER;
            uint256 remaining = pos.earned < cap ? cap - pos.earned : 0;
            if (remaining > 0) {
                uint256 actual = usdtReward > remaining ? remaining : usdtReward;
                if (actual > 0) {
                    pos.earned += actual;
                    totalReward += actual;
                }
            }
            pos.lastClaimPeriod = _targetPeriod;
            if (pos.earned >= cap) {
                pos.closed = true;
                emit PositionClosed(_user, i, pos.principal, pos.earned);
            }
            anySettled = true;
        }

        if (anySettled) user.lastClaimDay = _targetPeriod;

        if (totalReward > 0) {
            uint256 xmrReward = totalReward * 10 ** 18 / xmrPrice;
            if (xmrReward > 0) {
                xmrToken.mint(address(this), xmrReward);
                user.pendingXMR += xmrReward;
            }

            user.totalEarned += totalReward;

            _distributeTeamRewards(_user, totalReward);

            emit StaticRewardClaimed(_user, totalReward, xmrReward);
        }

        _checkAccountExit(_user);
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

    /// 迁移导入（多仓位版）：支持每个用户多个仓位（扁平化编码）
    /// _principals / _earneds 按用户依次展开：前 _userPosCounts[0] 个属于第 1 个用户，以此类推
    function batchImportPositions(
        address[] calldata _users,
        address[] calldata _referrers,
        uint256[] calldata _userPosCounts,
        uint256[] calldata _principals,
        uint256[] calldata _earneds,
        uint256[] calldata _pendingUSDTs,
        uint256[] calldata _pendingXMRs
    ) external onlyOwner {
        uint256 n = _users.length;
        require(n > 0 && n <= 100, "Batch must be 1-100 users");
        require(_referrers.length == n, "Referrers length mismatch");
        require(_userPosCounts.length == n, "Counts length mismatch");
        require(_pendingUSDTs.length == n, "USDT length mismatch");
        require(_pendingXMRs.length == n, "XMR length mismatch");

        uint256 idx = 0;
        for (uint256 i = 0; i < n; i++) {
            address user = _users[i];
            require(_userPosCounts[i] >= 1 && _userPosCounts[i] <= MAX_POSITIONS, "Invalid position count");
            require(positions[user].length + _userPosCounts[i] <= MAX_POSITIONS, "Exceeds position limit");

            User storage u = users[user];
            if (!u.isRegistered) {
                _importRegister(user, _referrers[i]);
            } else {
                require(_referrers[i] == address(0) || _referrers[i] == u.referrer, "Referrer mismatch");
            }

            uint256 totalPrincipal = 0;
            for (uint256 k = 0; k < _userPosCounts[i]; k++) {
                require(idx < _principals.length, "Principals length mismatch");
                uint256 principal = _principals[idx];
                uint256 earned = _earneds[idx];
                idx++;
                require(principal > 0, "Zero principal");

                bool closed = earned >= principal * EXIT_MULTIPLIER;
                positions[user].push(Position({
                    principal: principal,
                    earned: earned,
                    lastClaimPeriod: _currentPeriod(),
                    closed: closed
                }));

                totalPrincipal += principal;
                u.personalAmount += principal;
                u.totalEarned += earned;
            }
            if (idx > _earneds.length) revert("Earneds length mismatch");

            u.exitLimit = u.personalAmount * EXIT_MULTIPLIER;
            u.lastClaimDay = _currentPeriod();

            if (totalPrincipal > 0) {
                _updateTeamVolumesAndLevels(user, totalPrincipal);
            }
            _checkAndSetLevel(user);

            if (_pendingUSDTs[i] > 0) u.pendingUSDT += _pendingUSDTs[i];
            if (_pendingXMRs[i] > 0) {
                xmrToken.mint(address(this), _pendingXMRs[i]);
                u.pendingXMR += _pendingXMRs[i];
            }

            _checkAccountExit(user);
        }
        require(idx == _principals.length, "Principals length mismatch (trailing)");
        require(idx == _earneds.length, "Earneds length mismatch (trailing)");
    }

    /// 迁移注册（与 register 等价，供导入使用）
    function _importRegister(address _user, address _referrer) internal {
        require(!users[_user].isRegistered, "Already registered");
        require(_user != _referrer, "Cannot refer self");

        uint256 salt = nextMemberId++;
        uint256 memberId;
        do {
            memberId = 10001 + uint256(keccak256(abi.encodePacked(
                block.prevrandao, block.timestamp, _user, salt++
            ))) % 999999;
        } while (memberIdToAddress[memberId] != address(0));

        User storage u = users[_user];
        u.isRegistered = true;
        u.referrer = _referrer;
        u.registerTime = block.timestamp;
        u.lastClaimDay = _currentPeriod();
        userList.push(_user);

        addressToMemberId[_user] = memberId;
        memberIdToAddress[memberId] = _user;

        if (_referrer != address(0)) {
            require(users[_referrer].isRegistered, "Referrer not registered");
            directReferrals[_referrer].push(_user);
        }

        totalUsers += 1;
        emit Registered(_user, _referrer, memberId);
    }

    /// 动态收益按仓位顺序（FIFO）填充：先补满最早的仓位，溢出到下一个仓位；全部满则剩余丢弃
    function _creditFifo(address _user, uint256 _amount) internal returns (uint256 credited) {
        User storage user = users[_user];
        if (user.exited) return 0;

        Position[] storage posList = positions[_user];
        for (uint256 i = 0; i < posList.length; i++) {
            if (credited >= _amount) break;
            Position storage pos = posList[i];
            if (pos.closed) continue;

            uint256 cap = pos.principal * EXIT_MULTIPLIER;
            uint256 remaining = pos.earned < cap ? cap - pos.earned : 0;
            if (remaining == 0) {
                pos.closed = true;
                continue;
            }

            uint256 fill = _amount - credited;
            if (fill > remaining) fill = remaining;
            pos.earned += fill;
            credited += fill;

            if (pos.earned >= cap) {
                pos.closed = true;
                emit PositionClosed(_user, i, pos.principal, pos.earned);
            }
        }

        if (credited > 0) {
            user.totalEarned += credited;
        }
        _checkAccountExit(_user);
    }

    /// 账号出局判定：所有仓位均 closed 时置 exited = true（emit 只发一次）
    function _checkAccountExit(address _user) internal {
        User storage user = users[_user];
        if (user.exited) return;

        Position[] storage posList = positions[_user];
        if (posList.length == 0) return;
        for (uint256 i = 0; i < posList.length; i++) {
            if (!posList[i].closed) return;
        }
        user.exited = true;
        emit Exited(_user, user.totalEarned);
    }

    /// 仓位数量触顶时，就地压缩移除已关闭仓位（仅 invest 前调用）
    function _compactClosedPositions(address _user) internal {
        Position[] storage posList = positions[_user];
        if (posList.length < MAX_POSITIONS) return;

        uint256 write = 0;
        for (uint256 i = 0; i < posList.length; i++) {
            if (!posList[i].closed) {
                if (write != i) posList[write] = posList[i];
                write++;
            }
        }
        while (posList.length > write) posList.pop();
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

    /// 12 代推荐奖（投资时按仓位顺序填充上级仓位）
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
                    uint256 credited = _creditFifo(current, genReward);

                    if (credited > 0) {
                        ancestor.pendingUSDT += credited;
                        emit GenerationReward(current, _user, uint8(depth + 1), credited);
                    }
                }
            }

            current = ancestor.referrer;
            depth += 1;
        }
    }

    /// 团队奖（直推奖 + 级差奖 + 平级/超越奖，随静态收益逐笔结算，XMR 记账，按仓位 FIFO 填充）
    function _distributeTeamRewards(address _user, uint256 _baseValue) internal {
        address current = users[_user].referrer;
        uint256 pathMaxRate = users[_user].level > 0
            ? levels[users[_user].level - 1].teamRate
            : 0;
        bool isDirect = true;
        uint256 depth = 0;

        while (current != address(0) && depth < MAX_TEAM_DEPTH) {
            User storage ancestor = users[current];

            if (ancestor.level > 0 && !ancestor.exited && !ancestor.isBlacklisted) {
                uint256 currentRate = levels[ancestor.level - 1].teamRate;
                uint256 reward;

                if (isDirect) {
                    reward = _baseValue * currentRate / 10000;
                } else if (currentRate > pathMaxRate) {
                    reward = _baseValue * (currentRate - pathMaxRate) / 10000;
                }

                if (reward > 0) {
                    uint256 credited = _creditTeamReward(current, _user, reward);
                    if (credited > 0) {
                        _payPeerBonus(current, credited);
                    }
                }
            }

            if (ancestor.level > 0) {
                uint256 r = levels[ancestor.level - 1].teamRate;
                if (r > pathMaxRate) pathMaxRate = r;
            }

            isDirect = false;
            current = ancestor.referrer;
            depth += 1;
        }
    }

    /// 团队奖入账：按仓位 FIFO 填充，实发部分按 XMR 记账；返回实际入账额
    function _creditTeamReward(address _to, address _from, uint256 _amount) internal returns (uint256 credited) {
        User storage user = users[_to];
        if (_amount == 0 || user.exited) return 0;

        credited = _creditFifo(_to, _amount);
        if (credited == 0) return 0;

        uint256 xmrReward = credited * 10 ** 18 / xmrPrice;
        if (xmrReward > 0) {
            xmrToken.mint(address(this), xmrReward);
            user.pendingXMR += xmrReward;
        }
        emit TeamReward(_to, _from, user.level, credited);
    }

    /// 平级/超越奖：_child 获得动态收益 _amount 时，其直推上级若级别不高于 _child，拿 10%
    function _payPeerBonus(address _child, uint256 _amount) internal {
        address up = users[_child].referrer;
        if (up == address(0)) return;

        User storage parent = users[up];
        if (parent.exited || parent.isBlacklisted) return;
        if (users[_child].level < parent.level) return;

        uint256 bonus = _amount * 1000 / 10000;
        _creditTeamReward(up, _child, bonus);
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

    /// 仓位数量
    function getPositionCount(address _user) external view returns (uint256) {
        return positions[_user].length;
    }

    /// 单个仓位详情（含剩余额度）
    function getPositionInfo(address _user, uint256 _index) external view returns (PositionInfoView memory) {
        require(_index < positions[_user].length, "Invalid index");
        Position storage pos = positions[_user][_index];
        uint256 cap = pos.principal * EXIT_MULTIPLIER;
        return PositionInfoView({
            principal: pos.principal,
            earned: pos.earned,
            lastClaimPeriod: pos.lastClaimPeriod,
            closed: pos.closed,
            capacity: cap,
            remaining: pos.earned < cap ? cap - pos.earned : 0
        });
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
            dailyRate: DAILY_RATE,
            computingPower: 100,
            withdrawFee: withdrawFee,
            paused: paused,
            contractUSDTBalance: usdtToken.balanceOf(address(this)),
            contractXMRBalance: xmrToken.balanceOf(address(this))
        });
    }

    /// 预估静态收益：按各未关闭仓位独立计算后汇总
    function estimateStaticReward(address _user) external view returns (
        uint256 usdtValue,
        uint256 xmrValue
    ) {
        if (xmrPrice == 0) return (0, 0);

        uint256 currentPeriod = _currentPeriod();
        Position[] storage posList = positions[_user];

        for (uint256 i = 0; i < posList.length; i++) {
            Position storage pos = posList[i];
            if (pos.closed) continue;
            if (currentPeriod <= pos.lastClaimPeriod) continue;

            uint256 periodsPassed = currentPeriod - pos.lastClaimPeriod;
            if (periodsPassed > maxClaimPeriods) periodsPassed = maxClaimPeriods;

            // 与结算公式一致：每周期 = 1 天，发放日化 1%
            uint256 reward = pos.principal * DAILY_RATE * periodsPassed
                / 10000;
            uint256 cap = pos.principal * EXIT_MULTIPLIER;
            uint256 remaining = pos.earned < cap ? cap - pos.earned : 0;
            if (reward > remaining) reward = remaining;

            usdtValue += reward;
        }

        if (usdtValue > 0) {
            xmrValue = usdtValue * 10 ** 18 / xmrPrice;
        }
    }
}