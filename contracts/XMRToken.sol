// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract XMRToken is ERC20, Ownable {
    address public minter;
    uint256 public constant MAX_SUPPLY = 21_000_000 * 10 ** 18;

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    constructor() ERC20("XMR Token", "XMR") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function setMinter(address _minter) external onlyOwner {
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "XMR: caller is not minter");
        require(totalSupply() + amount <= MAX_SUPPLY, "XMR: exceeds max supply");
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
