// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockERC20
 * @dev 用于测试的 ERC20 代币
 * @notice 安全版本 - 铸造功能仅限Owner调用
 * @dev 生产环境请使用正式的代币合约，不要使用此测试合约
 */
contract MockERC20 is ERC20, Ownable {
    // 铸造上限 (可选的额外安全措施)
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18; // 1亿代币上限
    
    // 铸造者白名单 (除了owner外可以铸造的地址)
    mapping(address => bool) public isMinter;

    // ===== 事件 =====
    event MinterUpdated(address indexed minter, bool status);

    // ===== 错误 =====
    error NotMinter();
    error ExceedsMaxSupply();

    constructor(string memory name, string memory symbol) 
        ERC20(name, symbol) 
        Ownable(msg.sender) 
    {
        // 部署时直接给 owner 铸造 100万个代币方便测试
        _mint(msg.sender, 1_000_000 * 10**decimals());
    }

    /**
     * @notice 设置铸造者权限
     * @param minter 铸造者地址
     * @param status 是否允许铸造
     */
    function setMinter(address minter, bool status) external onlyOwner {
        isMinter[minter] = status;
        emit MinterUpdated(minter, status);
    }

    /**
     * @notice 铸造代币 (仅限 Owner 或授权铸造者)
     * @param to 接收地址
     * @param amount 铸造数量
     */
    function mint(address to, uint256 amount) external {
        if (msg.sender != owner() && !isMinter[msg.sender]) {
            revert NotMinter();
        }
        if (totalSupply() + amount > MAX_SUPPLY) {
            revert ExceedsMaxSupply();
        }
        _mint(to, amount);
    }

    /**
     * @notice 销毁代币
     * @param amount 销毁数量
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @notice 从指定地址销毁代币 (需要授权)
     * @param from 销毁来源地址
     * @param amount 销毁数量
     */
    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }
}
