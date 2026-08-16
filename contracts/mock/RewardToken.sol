// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// 测试用分红代币：部署即铸造 10 万枚给部署者（用于 PancakeSwap 测试网加池）
contract RewardToken is ERC20 {
    constructor() ERC20("Reward Token", "REWARD") {
        _mint(msg.sender, 100000 * 10 ** decimals());
    }
}
