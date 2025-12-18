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

    // 修改前 (录视频时改回 5 minutes)
    uint256 public constant ROUND_DURATION = 5 minutes;
    
    uint256 public currentRoundId;
    uint256 public lastClearingTime;
    
    // 状态开关
    bool public isRoundActive;

    mapping(address => bool) public isWhitelisted;

    struct RoundInfo {
        uint256 totalBidAmount;
        uint256 clearingPrice;
        bool isCleared;
    }

    mapping(uint256 => RoundInfo) public rounds;
    mapping(uint256 => mapping(address => uint256)) public userBids;

    // 🌟 修改点 1: 事件增加 limitPrice
    event BidPlaced(uint256 indexed roundId, address indexed user, uint256 amount, uint256 limitPrice);
    
    event RoundCleared(uint256 indexed roundId, uint256 clearingPrice, uint256 totalVolume);
    event GreenShoeActivated(uint256 amountLocked);
    event RoundStarted(uint256 indexed roundId, uint256 startTime);

    constructor(address _token, address _currency) Ownable(msg.sender) {
        auctionToken = IERC20(_token);
        paymentCurrency = IERC20(_currency);
        
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

    // 🌟 修改点 2: 增加 _limitPrice 参数
    function placeBid(uint256 amount, uint256 _limitPrice) external onlyWhitelisted {
        require(isRoundActive, "Round is NOT active");
        require(amount > 0, "Amount > 0");
        require(_limitPrice > 0, "Limit Price > 0"); // 必须有限价

        if (block.timestamp > lastClearingTime + ROUND_DURATION) {
            revert("Round time expired, waiting for clearing");
        }

        paymentCurrency.transferFrom(msg.sender, address(this), amount);
        
        userBids[currentRoundId][msg.sender] += amount;
        rounds[currentRoundId].totalBidAmount += amount;
        
        // 🌟 修改点 3: 广播包含价格的事件 (这是给后端数据库听的关键信号)
        emit BidPlaced(currentRoundId, msg.sender, amount, _limitPrice);
    }

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

        isRoundActive = false; 
    }

    function startNextRound() external onlyOwner {
        require(!isRoundActive, "Round is already active");
        
        currentRoundId++;
        lastClearingTime = block.timestamp;
        isRoundActive = true;
        
        emit RoundStarted(currentRoundId, lastClearingTime);
    }
}