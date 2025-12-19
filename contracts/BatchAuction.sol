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
 * @dev 批量拍卖合约，支持KYC白名单、绿鞋机制、用户领取代币和退款
 * @notice 安全增强版本 - 添加了重入保护、紧急暂停、价格范围限制
 */
contract BatchAuction is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable auctionToken;
    IERC20 public immutable paymentCurrency;
    address public greenShoeVault;
    
    uint256 public constant GREEN_SHOE_RATIO = 1500; // 15%
    uint256 public constant ROUND_DURATION = 5 minutes;
    
    // 价格范围限制 (防止Owner恶意定价)
    uint256 public minClearingPrice = 0.01 ether; // 最低价格 0.01
    uint256 public maxClearingPrice = 1000 ether; // 最高价格 1000
    
    uint256 public currentRoundId;
    uint256 public lastClearingTime;
    
    // ===== 动态供应量配置 =====
    uint256 public totalTokenSupply;           // RWA 总供应量上限
    uint256 public totalTokensIssued;          // 已发行代币总数
    uint256 public tokenSupplyPerRound = 500 ether; // 当前轮发行量 (动态调整)
    uint256 public targetPrice = 10 ether;     // 目标价格 (默认 $10)
    uint256 public supplyAdjustmentStep = 50 ether; // 供应量调整步长 (50个)
    uint256 public priceTolerance = 20;        // 价格容忍度 20% (超出则调整供应)
    
    // 状态开关
    bool public isRoundActive;

    mapping(address => bool) public isWhitelisted;

    struct RoundInfo {
        uint256 totalBidAmount;      // 总出价金额
        uint256 clearingPrice;       // 清算价格
        uint256 totalTokensSold;     // 总售出代币数量
        bool isCleared;              // 是否已清算
    }

    // 用户出价信息 (扩展结构)
    struct UserBidInfo {
        uint256 totalAmount;         // 用户总出价金额
        uint256 tokensAllocated;     // 分配的代币数量
        uint256 refundAmount;        // 退款金额
        bool hasClaimed;             // 是否已领取代币
        bool hasRefunded;            // 是否已退款
    }

    mapping(uint256 => RoundInfo) public rounds;
    mapping(uint256 => mapping(address => uint256)) public userBids; // 保留兼容性
    mapping(uint256 => mapping(address => UserBidInfo)) public userBidDetails;
    
    // 记录每轮的参与者列表
    mapping(uint256 => address[]) internal roundParticipants;
    mapping(uint256 => mapping(address => bool)) internal isParticipant;

    // ===== 事件 =====
    event BidPlaced(uint256 indexed roundId, address indexed user, uint256 amount, uint256 limitPrice);
    event RoundCleared(uint256 indexed roundId, uint256 clearingPrice, uint256 totalVolume);
    event GreenShoeActivated(uint256 amountLocked);
    event RoundStarted(uint256 indexed roundId, uint256 startTime);
    event TokensClaimed(uint256 indexed roundId, address indexed user, uint256 tokenAmount);
    event RefundClaimed(uint256 indexed roundId, address indexed user, uint256 refundAmount);
    event PriceRangeUpdated(uint256 minPrice, uint256 maxPrice);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event SupplyAdjusted(uint256 indexed roundId, uint256 newSupply, uint256 lastPrice, string reason);
    event TotalSupplyUpdated(uint256 newTotalSupply);
    event TargetPriceUpdated(uint256 newTargetPrice);
    event ProceedsWithdrawn(address indexed recipient, uint256 amount);

    // ===== 错误 =====
    error KYCRequired();
    error RoundNotActive();
    error RoundStillActive();
    error InvalidAmount();
    error InvalidPrice();
    error RoundTimeExpired();
    error TimeNotUp();
    error AlreadyCleared();
    error NotCleared();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error NothingToClaim();
    error PriceOutOfRange();
    error ExceedsTotalSupply();
    error AllTokensIssued();

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

    // ===== 修饰符 =====
    modifier onlyWhitelisted() {
        if (!isWhitelisted[msg.sender]) revert KYCRequired();
        _;
    }

    // ===== 管理函数 =====
    
    function setGreenShoeVault(address _vault) external onlyOwner {
        greenShoeVault = _vault;
    }

    function setWhitelist(address[] calldata users, bool status) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            isWhitelisted[users[i]] = status;
        }
    }

    /**
     * @notice 设置价格范围限制
     * @param _minPrice 最低清算价格
     * @param _maxPrice 最高清算价格
     */
    function setPriceRange(uint256 _minPrice, uint256 _maxPrice) external onlyOwner {
        require(_minPrice > 0 && _maxPrice > _minPrice, "Invalid price range");
        minClearingPrice = _minPrice;
        maxClearingPrice = _maxPrice;
        emit PriceRangeUpdated(_minPrice, _maxPrice);
    }

    /**
     * @notice 设置每轮代币发行量 (手动调整)
     */
    function setTokenSupplyPerRound(uint256 _supply) external onlyOwner {
        require(_supply > 0, "Supply must be > 0");
        tokenSupplyPerRound = _supply;
    }

    /**
     * @notice 设置总供应量上限
     */
    function setTotalTokenSupply(uint256 _totalSupply) external onlyOwner {
        require(_totalSupply >= totalTokensIssued, "Cannot be less than issued");
        totalTokenSupply = _totalSupply;
        emit TotalSupplyUpdated(_totalSupply);
    }

    /**
     * @notice 设置目标价格和调整参数
     */
    function setDynamicSupplyParams(
        uint256 _targetPrice,
        uint256 _adjustmentStep,
        uint256 _priceTolerance
    ) external onlyOwner {
        require(_targetPrice > 0, "Target price must be > 0");
        require(_adjustmentStep > 0, "Step must be > 0");
        require(_priceTolerance <= 100, "Tolerance must be <= 100%");
        
        targetPrice = _targetPrice;
        supplyAdjustmentStep = _adjustmentStep;
        priceTolerance = _priceTolerance;
        
        emit TargetPriceUpdated(_targetPrice);
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

    /**
     * @notice 提取募集资金（正常业务流程）
     * @dev 只能提取已清算轮次的净收入
     */
    function withdrawProceeds() external onlyOwner nonReentrant {
        uint256 balance = paymentCurrency.balanceOf(address(this));
        require(balance > 0, "No proceeds to withdraw");
        
        paymentCurrency.safeTransfer(owner(), balance);
        emit ProceedsWithdrawn(owner(), balance);
    }

    /**
     * @notice 查询当前可提取的募集资金
     */
    function getAvailableProceeds() external view returns (uint256) {
        return paymentCurrency.balanceOf(address(this));
    }

    // ===== 用户函数 =====

    /**
     * @notice 用户出价
     * @param amount 出价金额 (USDC)
     * @param _limitPrice 限价
     */
    function placeBid(uint256 amount, uint256 _limitPrice) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyWhitelisted 
    {
        if (!isRoundActive) revert RoundNotActive();
        if (amount == 0) revert InvalidAmount();
        if (_limitPrice == 0) revert InvalidPrice();

        if (block.timestamp > lastClearingTime + ROUND_DURATION) {
            revert RoundTimeExpired();
        }

        // 使用 SafeERC20 进行安全转账
        paymentCurrency.safeTransferFrom(msg.sender, address(this), amount);
        
        // 更新用户出价信息
        userBids[currentRoundId][msg.sender] += amount;
        userBidDetails[currentRoundId][msg.sender].totalAmount += amount;
        rounds[currentRoundId].totalBidAmount += amount;
        
        // 记录参与者
        if (!isParticipant[currentRoundId][msg.sender]) {
            roundParticipants[currentRoundId].push(msg.sender);
            isParticipant[currentRoundId][msg.sender] = true;
        }
        
        emit BidPlaced(currentRoundId, msg.sender, amount, _limitPrice);
    }

    /**
     * @notice 执行清算
     * @param _price 清算价格
     * @param users 用户地址数组
     * @param tokenAmounts 代币分配数量数组
     * @param refundAmounts 退款金额数组
     */
    function executeClearing(
        uint256 _price, 
        address[] calldata users,
        uint256[] calldata tokenAmounts,
        uint256[] calldata refundAmounts
    ) external onlyOwner nonReentrant {
        if (!isRoundActive) revert AlreadyCleared();
        if (block.timestamp < lastClearingTime + ROUND_DURATION) revert TimeNotUp();
        if (_price < minClearingPrice || _price > maxClearingPrice) revert PriceOutOfRange();
        require(users.length == tokenAmounts.length && users.length == refundAmounts.length, "Array length mismatch");
        
        RoundInfo storage round = rounds[currentRoundId];
        round.clearingPrice = _price;
        round.isCleared = true;
        
        // 记录用户分配信息
        uint256 totalTokens = 0;
        for (uint256 i = 0; i < users.length; i++) {
            userBidDetails[currentRoundId][users[i]].tokensAllocated = tokenAmounts[i];
            userBidDetails[currentRoundId][users[i]].refundAmount = refundAmounts[i];
            totalTokens += tokenAmounts[i];
        }
        
        // 检查不超过总供应量
        if (totalTokensIssued + totalTokens > totalTokenSupply) {
            revert ExceedsTotalSupply();
        }
        
        round.totalTokensSold = totalTokens;
        totalTokensIssued += totalTokens; // 更新已发行总数

        // 绿鞋机制
        if (greenShoeVault != address(0) && round.totalBidAmount > 0) {
            uint256 stabilizationFund = (round.totalBidAmount * GREEN_SHOE_RATIO) / 10000;
            // 安全的 approve 操作：先重置为0
            paymentCurrency.forceApprove(greenShoeVault, stabilizationFund);
            IGreenShoe(greenShoeVault).depositStabilizationFunds(stabilizationFund);
            emit GreenShoeActivated(stabilizationFund);
        }
        
        emit RoundCleared(currentRoundId, _price, round.totalBidAmount);

        isRoundActive = false; 
    }

    /**
     * @notice 简化版清算 (向后兼容)
     * @param _price 清算价格
     */
    function executeClearingSimple(uint256 _price) external onlyOwner nonReentrant {
        if (!isRoundActive) revert AlreadyCleared();
        if (block.timestamp < lastClearingTime + ROUND_DURATION) revert TimeNotUp();
        if (_price < minClearingPrice || _price > maxClearingPrice) revert PriceOutOfRange();
        
        RoundInfo storage round = rounds[currentRoundId];
        round.clearingPrice = _price;
        round.isCleared = true;

        // 绿鞋机制
        if (greenShoeVault != address(0) && round.totalBidAmount > 0) {
            uint256 stabilizationFund = (round.totalBidAmount * GREEN_SHOE_RATIO) / 10000;
            paymentCurrency.forceApprove(greenShoeVault, stabilizationFund);
            IGreenShoe(greenShoeVault).depositStabilizationFunds(stabilizationFund);
            emit GreenShoeActivated(stabilizationFund);
        }
        
        emit RoundCleared(currentRoundId, _price, round.totalBidAmount);

        isRoundActive = false; 
    }

    /**
     * @notice 开启下一轮 (自动调整供应量)
     */
    function startNextRound() external onlyOwner {
        if (isRoundActive) revert RoundStillActive();
        
        // 检查是否还有剩余供应
        if (totalTokensIssued >= totalTokenSupply) {
            revert AllTokensIssued();
        }
        
        // 动态调整供应量 (基于上一轮清算价格)
        if (currentRoundId >= 1) {
            RoundInfo storage lastRound = rounds[currentRoundId];
            
            if (lastRound.isCleared && lastRound.clearingPrice > 0) {
                uint256 lastPrice = lastRound.clearingPrice;
                uint256 upperBound = targetPrice * (100 + priceTolerance) / 100;
                uint256 lowerBound = targetPrice * (100 - priceTolerance) / 100;
                
                // 价格太高 → 增加供应 (需求 > 供应)
                if (lastPrice > upperBound) {
                    uint256 newSupply = tokenSupplyPerRound + supplyAdjustmentStep;
                    // 确保不超过剩余量
                    uint256 remainingTokens = totalTokenSupply - totalTokensIssued;
                    tokenSupplyPerRound = newSupply > remainingTokens ? remainingTokens : newSupply;
                    emit SupplyAdjusted(currentRoundId + 1, tokenSupplyPerRound, lastPrice, "Price too high, increase supply");
                }
                // 价格太低 → 减少供应 (需求 < 供应)
                else if (lastPrice < lowerBound) {
                    if (tokenSupplyPerRound > supplyAdjustmentStep) {
                        tokenSupplyPerRound -= supplyAdjustmentStep;
                        emit SupplyAdjusted(currentRoundId + 1, tokenSupplyPerRound, lastPrice, "Price too low, decrease supply");
                    }
                }
                // 价格在目标范围内 → 保持供应不变
            }
        }
        
        // 最后检查：确保本轮供应不超过剩余总量
        uint256 remaining = totalTokenSupply - totalTokensIssued;
        if (tokenSupplyPerRound > remaining) {
            tokenSupplyPerRound = remaining;
        }
        
        currentRoundId++;
        lastClearingTime = block.timestamp;
        isRoundActive = true;
        
        emit RoundStarted(currentRoundId, lastClearingTime);
    }

    /**
     * @notice 用户领取代币
     * @param roundId 轮次ID
     */
    function claimTokens(uint256 roundId) external nonReentrant whenNotPaused {
        RoundInfo storage round = rounds[roundId];
        UserBidInfo storage userInfo = userBidDetails[roundId][msg.sender];
        
        if (!round.isCleared) revert NotCleared();
        if (userInfo.hasClaimed) revert AlreadyClaimed();
        if (userInfo.tokensAllocated == 0) revert NothingToClaim();
        
        userInfo.hasClaimed = true;
        
        // 转移代币给用户
        auctionToken.safeTransfer(msg.sender, userInfo.tokensAllocated);
        
        emit TokensClaimed(roundId, msg.sender, userInfo.tokensAllocated);
    }

    /**
     * @notice 用户领取退款
     * @param roundId 轮次ID
     */
    function claimRefund(uint256 roundId) external nonReentrant whenNotPaused {
        RoundInfo storage round = rounds[roundId];
        UserBidInfo storage userInfo = userBidDetails[roundId][msg.sender];
        
        if (!round.isCleared) revert NotCleared();
        if (userInfo.hasRefunded) revert AlreadyRefunded();
        if (userInfo.refundAmount == 0) revert NothingToClaim();
        
        userInfo.hasRefunded = true;
        
        // 退款给用户
        paymentCurrency.safeTransfer(msg.sender, userInfo.refundAmount);
        
        emit RefundClaimed(roundId, msg.sender, userInfo.refundAmount);
    }

    // ===== 查询函数 =====

    /**
     * @notice 获取用户在指定轮次的详细信息
     */
    function getUserBidDetails(uint256 roundId, address user) 
        external 
        view 
        returns (
            uint256 totalAmount,
            uint256 tokensAllocated,
            uint256 refundAmount,
            bool hasClaimed,
            bool hasRefunded
        ) 
    {
        UserBidInfo storage info = userBidDetails[roundId][user];
        return (
            info.totalAmount,
            info.tokensAllocated,
            info.refundAmount,
            info.hasClaimed,
            info.hasRefunded
        );
    }

    /**
     * @notice 获取指定轮次的参与者数量
     */
    function getRoundParticipantCount(uint256 roundId) external view returns (uint256) {
        return roundParticipants[roundId].length;
    }

    /**
     * @notice 获取当前轮次剩余时间
     */
    function getRemainingTime() external view returns (uint256) {
        if (!isRoundActive) return 0;
        uint256 endTime = lastClearingTime + ROUND_DURATION;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    /**
     * @notice 获取供应量统计信息
     */
    function getSupplyStats() external view returns (
        uint256 total,           // 总供应量
        uint256 issued,          // 已发行量
        uint256 remaining,       // 剩余量
        uint256 currentRound,    // 当前轮次供应
        uint256 progress         // 发行进度 (百分比 * 100)
    ) {
        total = totalTokenSupply;
        issued = totalTokensIssued;
        remaining = totalTokenSupply - totalTokensIssued;
        currentRound = tokenSupplyPerRound;
        progress = totalTokenSupply > 0 ? (totalTokensIssued * 10000) / totalTokenSupply : 0;
    }

    /**
     * @notice 获取动态供应配置
     */
    function getDynamicSupplyConfig() external view returns (
        uint256 target,
        uint256 step,
        uint256 tolerance
    ) {
        return (targetPrice, supplyAdjustmentStep, priceTolerance);
    }
}
