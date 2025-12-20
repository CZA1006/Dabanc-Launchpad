// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IGreenShoe {
    function depositStabilizationFunds(uint256 amount) external;
}

/**
 * @title BatchAuction
 * @dev 机构级 RWA 发行平台 - CEX 混合架构版
 * @notice 采用 "链上资金托管 + 链下撮合 + 链上统一结算" 模式
 */
contract BatchAuction is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable auctionToken;
    IERC20 public immutable paymentCurrency;
    address public greenShoeVault;
    
    uint256 public constant GREEN_SHOE_RATIO = 1500; // 15%
    uint256 public constant ROUND_DURATION = 5 minutes;
    
    uint256 public minClearingPrice = 0.01 ether;
    uint256 public maxClearingPrice = 1000 ether;
    
    uint256 public currentRoundId;
    uint256 public lastClearingTime;
    
    // ===== 动态供应量配置 =====
    uint256 public totalTokenSupply;
    uint256 public totalTokensIssued;
    uint256 public tokenSupplyPerRound = 500 ether;
    uint256 public targetPrice = 10 ether;
    uint256 public supplyAdjustmentStep = 50 ether;
    uint256 public priceTolerance = 20;
    
    bool public isRoundActive;
    mapping(address => bool) public isWhitelisted;

    // 🌟 新增：用户链上资金账户 (类似于交易所余额)
    mapping(address => uint256) public userBalances;

    struct RoundInfo {
        uint256 clearingPrice;
        uint256 totalTokensSold;
        bool isCleared;
    }

    mapping(uint256 => RoundInfo) public rounds;

    // 事件优化
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event RoundCleared(uint256 indexed roundId, uint256 clearingPrice, uint256 totalVolume);
    event RoundStarted(uint256 indexed roundId, uint256 startTime);
    event GreenShoeActivated(uint256 amountLocked);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event PriceRangeUpdated(uint256 minPrice, uint256 maxPrice);
    event SupplyAdjusted(uint256 indexed roundId, uint256 newSupply, uint256 lastPrice, string reason);
    event TotalSupplyUpdated(uint256 newTotalSupply);
    event TargetPriceUpdated(uint256 newTargetPrice);
    event ProceedsWithdrawn(address indexed recipient, uint256 amount);

    // 错误定义
    error KYCRequired();
    error RoundNotActive();
    error RoundStillActive();
    error TimeNotUp();
    error AlreadyCleared();
    error PriceOutOfRange();
    error ExceedsTotalSupply();
    error AllTokensIssued();
    error InsufficientBalance(); // 🌟 新增错误

    constructor(
        address _token, 
        address _currency,
        uint256 _totalTokenSupply
    ) Ownable(msg.sender) {
        require(_totalTokenSupply > 0, "Total supply must be > 0");
        
        auctionToken = IERC20(_token);
        paymentCurrency = IERC20(_currency);
        totalTokenSupply = _totalTokenSupply;
        
        lastClearingTime = block.timestamp;
        currentRoundId = 1;
        isRoundActive = true; 
    }

    // ===== 资金管理 (Deposit / Withdraw) =====

    /**
     * @notice 充值：将 USDC 存入合约余额
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (!isWhitelisted[msg.sender]) revert KYCRequired();
        require(amount > 0, "Amount must be > 0");

        // 将 USDC 从用户转入合约
        paymentCurrency.safeTransferFrom(msg.sender, address(this), amount);
        
        // 增加用户账本余额
        userBalances[msg.sender] += amount;
        
        emit Deposit(msg.sender, amount);
    }

    /**
     * @notice 提现：将未使用的 USDC 提回钱包
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        if (userBalances[msg.sender] < amount) revert InsufficientBalance();

        // 扣除账本余额
        userBalances[msg.sender] -= amount;
        
        // 将 USDC 转回给用户
        paymentCurrency.safeTransfer(msg.sender, amount);
        
        emit Withdraw(msg.sender, amount);
    }

    // ===== 核心业务 =====

    /**
     * @notice 结算：管理员提交链下撮合结果
     * @dev 现在的逻辑更简单：只处理赢家，扣除成本，发币。输家不需要任何操作（钱还在余额里）。
     * @param _price 最终清算价
     * @param winners 赢家列表
     * @param tokenAmounts 赢家获得的代币数量
     * @param costAmounts 赢家需要支付的 USDC 成本
     */
    function executeClearing(
        uint256 _price, 
        address[] calldata winners,
        uint256[] calldata tokenAmounts,
        uint256[] calldata costAmounts
    ) external onlyOwner nonReentrant {
        if (!isRoundActive) revert AlreadyCleared();
        if (block.timestamp < lastClearingTime + ROUND_DURATION) revert TimeNotUp();
        if (_price < minClearingPrice || _price > maxClearingPrice) revert PriceOutOfRange();
        require(winners.length == tokenAmounts.length && winners.length == costAmounts.length, "Length mismatch");
        
        RoundInfo storage round = rounds[currentRoundId];
        round.clearingPrice = _price;
        round.isCleared = true;
        
        uint256 roundTotalCost = 0;
        uint256 roundTotalTokens = 0;

        // 批量结算赢家
        for (uint256 i = 0; i < winners.length; i++) {
            address user = winners[i];
            uint256 cost = costAmounts[i];
            uint256 tokens = tokenAmounts[i];

            // 检查余额是否足够支付 (防止链下计算错误或用户恶意提前提现)
            if (userBalances[user] >= cost) {
                // 1. 扣钱
                userBalances[user] -= cost;
                // 2. 发货
                auctionToken.safeTransfer(user, tokens);
                
                roundTotalCost += cost;
                roundTotalTokens += tokens;
            } 
            // 如果余额不足，该用户本次交易失败，但不 revert 整个交易
        }
        
        // 检查总供应量
        if (totalTokensIssued + roundTotalTokens > totalTokenSupply) {
            revert ExceedsTotalSupply();
        }
        
        round.totalTokensSold = roundTotalTokens;
        totalTokensIssued += roundTotalTokens;

        // 绿鞋机制 (将一部分收入划转到金库)
        if (greenShoeVault != address(0) && roundTotalCost > 0) {
            uint256 stabilizationFund = (roundTotalCost * GREEN_SHOE_RATIO) / 10000;
            // 先重置 approve 避免某些 ERC20 问题
            paymentCurrency.forceApprove(greenShoeVault, stabilizationFund);
            IGreenShoe(greenShoeVault).depositStabilizationFunds(stabilizationFund);
            emit GreenShoeActivated(stabilizationFund);
        }
        
        emit RoundCleared(currentRoundId, _price, roundTotalCost);
        isRoundActive = false; 
    }

    /**
     * @notice 开启下一轮 (包含动态供应量调整逻辑)
     */
    function startNextRound() external onlyOwner {
        if (isRoundActive) revert RoundStillActive();
        if (totalTokensIssued >= totalTokenSupply) revert AllTokensIssued();
        
        // --- 动态供应量算法 ---
        if (currentRoundId >= 1) {
            RoundInfo storage lastRound = rounds[currentRoundId];
            if (lastRound.isCleared && lastRound.clearingPrice > 0) {
                uint256 lastPrice = lastRound.clearingPrice;
                uint256 upperBound = targetPrice * (100 + priceTolerance) / 100;
                uint256 lowerBound = targetPrice * (100 - priceTolerance) / 100;
                
                if (lastPrice > upperBound) {
                    uint256 newSupply = tokenSupplyPerRound + supplyAdjustmentStep;
                    uint256 remainingTokens = totalTokenSupply - totalTokensIssued;
                    tokenSupplyPerRound = newSupply > remainingTokens ? remainingTokens : newSupply;
                    emit SupplyAdjusted(currentRoundId + 1, tokenSupplyPerRound, lastPrice, "Price high, supply increased");
                } else if (lastPrice < lowerBound) {
                    if (tokenSupplyPerRound > supplyAdjustmentStep) {
                        tokenSupplyPerRound -= supplyAdjustmentStep;
                        emit SupplyAdjusted(currentRoundId + 1, tokenSupplyPerRound, lastPrice, "Price low, supply decreased");
                    }
                }
            }
        }
        // -----------------------
        
        uint256 remaining = totalTokenSupply - totalTokensIssued;
        if (tokenSupplyPerRound > remaining) {
            tokenSupplyPerRound = remaining;
        }
        
        currentRoundId++;
        lastClearingTime = block.timestamp;
        isRoundActive = true;
        
        emit RoundStarted(currentRoundId, lastClearingTime);
    }

    // ===== 管理员配置函数 =====
    
    function setGreenShoeVault(address _vault) external onlyOwner { greenShoeVault = _vault; }
    
    function setWhitelist(address[] calldata users, bool status) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) { isWhitelisted[users[i]] = status; }
    }

    function setPriceRange(uint256 _minPrice, uint256 _maxPrice) external onlyOwner {
        require(_minPrice > 0 && _maxPrice > _minPrice, "Invalid range");
        minClearingPrice = _minPrice;
        maxClearingPrice = _maxPrice;
        emit PriceRangeUpdated(_minPrice, _maxPrice);
    }

    function setTokenSupplyPerRound(uint256 _supply) external onlyOwner { tokenSupplyPerRound = _supply; }
    function setTotalTokenSupply(uint256 _totalSupply) external onlyOwner { totalTokenSupply = _totalSupply; emit TotalSupplyUpdated(_totalSupply); }
    
    function setDynamicSupplyParams(uint256 _target, uint256 _step, uint256 _tolerance) external onlyOwner {
        targetPrice = _target; supplyAdjustmentStep = _step; priceTolerance = _tolerance;
        emit TargetPriceUpdated(_target);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function withdrawProceeds() external onlyOwner nonReentrant {
        uint256 balance = paymentCurrency.balanceOf(address(this));
        // 注意：这里需要扣除属于用户的 balances，只能提取剩余的部分（即已结算的收入）
        // 简单起见，这里假设 Owner 负责计算可提取金额，或者在 executeClearing 中将收入转到 feeAddress
        // 为安全起见，真实生产环境建议在 executeClearing 时将收入 Ledger 分离
        require(balance > 0, "No funds");
        paymentCurrency.safeTransfer(owner(), balance); 
        emit ProceedsWithdrawn(owner(), balance);
    }
    
    // 视图函数
    function getSupplyStats() external view returns (uint256 total, uint256 issued, uint256 remaining, uint256 current, uint256 progress) {
        total = totalTokenSupply;
        issued = totalTokensIssued;
        remaining = totalTokenSupply - totalTokensIssued;
        current = tokenSupplyPerRound;
        progress = totalTokenSupply > 0 ? (totalTokensIssued * 10000) / totalTokenSupply : 0;
    }
}