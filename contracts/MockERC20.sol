// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // 部署时直接给自己铸造 100万个代币方便测试
        _mint(msg.sender, 1000000 * 10**decimals());
    }

    // 允许我们在测试中随意铸造更多
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}