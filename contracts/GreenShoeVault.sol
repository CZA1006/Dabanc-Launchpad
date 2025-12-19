// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GreenShoeVault
 * @dev 绿鞋机制金库，用于护盘资金管理
 * @notice 安全增强版本 - 添加了重入保护、紧急暂停、DEX白名单
 */
contract GreenShoeVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable currency; // USDC

    // 只有拍卖合约可以调用存入
    address public auctionContract;
    
    // DEX 白名单
    mapping(address => bool) public approvedDexAddresses;
    
    // 统计信息
    uint256 public totalReceived;
    uint256 public totalUsedForBuyback;

    // ===== 事件 =====
    event FundsReceived(uint256 amount);
    event FundsUsedForStabilization(uint256 amount, address indexed target);
    event DexApprovalUpdated(address indexed dex, bool approved);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event AuctionContractUpdated(address indexed oldContract, address indexed newContract);

    // ===== 错误 =====
    error OnlyAuctionContract();
    error TransferFailed();
    error InsufficientFunds();
    error DexNotApproved();
    error InvalidAddress();

    constructor(address _currency) Ownable(msg.sender) {
        if (_currency == address(0)) revert InvalidAddress();
        currency = IERC20(_currency);
    }

    // ===== 管理函数 =====

    /**
     * @notice 设置拍卖合约地址
     */
    function setAuctionContract(address _auction) external onlyOwner {
        if (_auction == address(0)) revert InvalidAddress();
        address oldContract = auctionContract;
        auctionContract = _auction;
        emit AuctionContractUpdated(oldContract, _auction);
    }

    /**
     * @notice 设置 DEX 白名单状态
     * @param dex DEX 地址
     * @param approved 是否批准
     */
    function setApprovedDex(address dex, bool approved) external onlyOwner {
        if (dex == address(0)) revert InvalidAddress();
        approvedDexAddresses[dex] = approved;
        emit DexApprovalUpdated(dex, approved);
    }

    /**
     * @notice 批量设置 DEX 白名单
     * @param dexAddresses DEX 地址数组
     * @param approved 是否批准
     */
    function setApprovedDexBatch(address[] calldata dexAddresses, bool approved) external onlyOwner {
        for (uint256 i = 0; i < dexAddresses.length; i++) {
            if (dexAddresses[i] == address(0)) revert InvalidAddress();
            approvedDexAddresses[dexAddresses[i]] = approved;
            emit DexApprovalUpdated(dexAddresses[i], approved);
        }
    }

    /**
     * @notice 紧急暂停合约
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice 恢复合约
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice 紧急提取代币 (仅限紧急情况)
     * @param token 代币地址
     * @param amount 提取数量
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner whenPaused {
        IERC20(token).safeTransfer(owner(), amount);
        emit EmergencyWithdraw(token, amount);
    }

    // ===== 核心函数 =====

    /**
     * @notice 接收护盘资金 (仅拍卖合约可调用)
     * @param amount 资金数量
     */
    function depositStabilizationFunds(uint256 amount) external nonReentrant whenNotPaused {
        if (msg.sender != auctionContract) revert OnlyAuctionContract();
        
        // 使用 SafeERC20 进行安全转账
        currency.safeTransferFrom(msg.sender, address(this), amount);
        
        totalReceived += amount;
        emit FundsReceived(amount);
    }

    /**
     * @notice 执行回购护盘
     * @param amount 使用的资金数量
     * @param dexAddress 目标 DEX 地址 (必须在白名单中)
     */
    function executeBuyback(uint256 amount, address dexAddress) 
        external 
        onlyOwner 
        nonReentrant 
        whenNotPaused 
    {
        if (!approvedDexAddresses[dexAddress]) revert DexNotApproved();
        if (currency.balanceOf(address(this)) < amount) revert InsufficientFunds();
        
        // 在真实场景中，这里会调用 Uniswap/Hyperliquid 接口买入代币
        currency.safeTransfer(dexAddress, amount);
        
        totalUsedForBuyback += amount;
        emit FundsUsedForStabilization(amount, dexAddress);
    }

    // ===== 查询函数 =====

    /**
     * @notice 获取当前金库余额
     */
    function getBalance() external view returns (uint256) {
        return currency.balanceOf(address(this));
    }

    /**
     * @notice 获取金库统计信息
     */
    function getStats() external view returns (
        uint256 balance,
        uint256 received,
        uint256 usedForBuyback
    ) {
        return (
            currency.balanceOf(address(this)),
            totalReceived,
            totalUsedForBuyback
        );
    }
}
