// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IGreenShoe {
    function depositStabilizationFunds(uint256 amount) external;
}

contract BatchAuction is Ownable {
    IERC20 public immutable auctionToken;
    IERC20 public immutable paymentCurrency;
    address public greenShoeVault;
    
    uint256 public constant GREEN_SHOE_RATIO = 1500; 
    uint256 public constant ROUND_DURATION = 5 minutes;
    
    uint256 public currentRoundId;
    uint256 public lastClearingTime;
    
    // === 🌟 新增状态：当前轮次是否正在进行 ===
    bool public isRoundActive;

    mapping(address => bool) public isWhitelisted;

    struct RoundInfo {
        uint256 totalBidAmount;
        uint256 clearingPrice;
        bool isCleared;
    }

    mapping(uint256 => RoundInfo) public rounds;
    mapping(uint256 => mapping(address => uint256)) public userBids;

    event BidPlaced(uint256 indexed roundId, address indexed user, uint256 amount);
    event RoundCleared(uint256 indexed roundId, uint256 clearingPrice, uint256 totalVolume);
    event GreenShoeActivated(uint256 amountLocked);
    event RoundStarted(uint256 indexed roundId, uint256 startTime); // 新增事件

    constructor(address _token, address _currency) Ownable(msg.sender) {
        auctionToken = IERC20(_token);
        paymentCurrency = IERC20(_currency);
        
        // 部署后默认开启第一轮
        lastClearingTime = block.timestamp;
        currentRoundId = 1;
        isRoundActive = true; 
    }

    modifier onlyWhitelisted() {
        require(isWhitelisted[msg.sender], "KYC Required");
        _;
    }

    function setGreenShoeVault(address _vault) external onlyOwner {
        greenShoeVault = _vault;
    }

    function setWhitelist(address[] calldata users, bool status) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            isWhitelisted[users[i]] = status;
        }
    }

    function placeBid(uint256 amount) external onlyWhitelisted {
        require(isRoundActive, "Round is NOT active"); // 暂停时不准出价
        require(amount > 0, "Amount > 0");
        
        // 简单的超时检查 (防止前端倒计时结束了还能偷鸡)
        if (block.timestamp > lastClearingTime + ROUND_DURATION) {
            revert("Round time expired, waiting for clearing");
        }

        paymentCurrency.transferFrom(msg.sender, address(this), amount);
        
        userBids[currentRoundId][msg.sender] += amount;
        rounds[currentRoundId].totalBidAmount += amount;
        
        emit BidPlaced(currentRoundId, msg.sender, amount);
    }

    // === 核心修改：结算后暂停 ===
    function executeClearing(uint256 _price) external onlyOwner {
        require(isRoundActive, "Round already cleared");
        require(block.timestamp >= lastClearingTime + ROUND_DURATION, "Time not up");
        
        RoundInfo storage round = rounds[currentRoundId];
        round.clearingPrice = _price;
        round.isCleared = true;

        if (greenShoeVault != address(0) && round.totalBidAmount > 0) {
            uint256 stabilizationFund = (round.totalBidAmount * GREEN_SHOE_RATIO) / 10000;
            paymentCurrency.approve(greenShoeVault, stabilizationFund);
            IGreenShoe(greenShoeVault).depositStabilizationFunds(stabilizationFund);
            emit GreenShoeActivated(stabilizationFund);
        }
        
        emit RoundCleared(currentRoundId, _price, round.totalBidAmount);

        // 🌟 关键：结算后，关闭状态，不立即开启下一轮
        isRoundActive = false; 
    }

    // === 新增：手动开启下一轮 ===
    function startNextRound() external onlyOwner {
        require(!isRoundActive, "Round is already active");
        
        currentRoundId++;
        lastClearingTime = block.timestamp;
        isRoundActive = true;
        
        emit RoundStarted(currentRoundId, lastClearingTime);
    }
}