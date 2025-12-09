// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GreenShoeVault is Ownable {
    IERC20 public immutable currency; // USDC

    // 只有拍卖合约可以调用存入
    address public auctionContract;

    event FundsReceived(uint256 amount);
    event FundsUsedForStabilization(uint256 amount, address target);

    constructor(address _currency) Ownable(msg.sender) {
        currency = IERC20(_currency);
    }

    function setAuctionContract(address _auction) external onlyOwner {
        auctionContract = _auction;
    }

    // 接收护盘资金
    function depositStabilizationFunds(uint256 amount) external {
        require(msg.sender == auctionContract, "Only auction contract");
        require(currency.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit FundsReceived(amount);
    }

    // 管理员在二级市场回购护盘 (模拟)
    function executeBuyback(uint256 amount, address dexAddress) external onlyOwner {
        require(currency.balanceOf(address(this)) >= amount, "Insufficient funds");
        // 在真实场景中，这里会调用 Uniswap/Hyperliquid 接口买入代币
        currency.transfer(dexAddress, amount); 
        emit FundsUsedForStabilization(amount, dexAddress);
    }
}