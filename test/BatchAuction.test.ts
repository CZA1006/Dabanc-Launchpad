import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("BatchAuction System", function () {
  // 定义一个“夹具”(Fixture)，用来部署合约，避免每个测试都重写一遍
  async function deployAuctionFixture() {
    const [owner, bidder1, bidder2] = await ethers.getSigners();

    // 1. 部署模拟代币
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.deploy("SpaceX Token", "SPX");
    const usdc = await MockToken.deploy("USD Coin", "USDC");

    // 2. 部署拍卖合约
    const Auction = await ethers.getContractFactory("BatchAuction");
    const auction = await Auction.deploy(await token.getAddress(), await usdc.getAddress());

    // 3. 初始设置：给 bidder1 发点 USDC，并授权给拍卖合约
    await usdc.transfer(bidder1.address, ethers.parseEther("1000")); // 转 1000 USDC
    await usdc.connect(bidder1).approve(await auction.getAddress(), ethers.parseEther("1000")); // 授权

    return { auction, token, usdc, owner, bidder1 };
  }

  it("Should execute clearing ONLY after 5 minutes", async function () {
    const { auction, bidder1 } = await deployAuctionFixture();

    // 1. 用户参与竞价 (投 100 USDC)
    await auction.connect(bidder1).placeBid(ethers.parseEther("100"));
    
    // 2. 尝试立即清算 (应该失败！)
    // 此时时间还没过 5 分钟
    await expect(auction.executeClearing(ethers.parseEther("1")))
      .to.be.revertedWith("Round not finished yet");

    // 3. 模拟时间流逝 300秒 (5分钟)
    await time.increase(300);

    // 4. 再次尝试清算 (应该成功！)
    // 假设清算价格为 1 USDC
    await expect(auction.executeClearing(ethers.parseEther("1")))
      .to.emit(auction, "RoundCleared")
      .withArgs(1, ethers.parseEther("1"), ethers.parseEther("100")); // roundId, price, totalVolume
  });

  it("Should update round ID after clearing", async function () {
    const { auction } = await deployAuctionFixture();

    // 初始轮次应该是 1
    expect(await auction.currentRoundId()).to.equal(1);

    // 快进时间并清算
    await time.increase(301);
    await auction.executeClearing(ethers.parseEther("1"));

    // 轮次应该变为 2
    expect(await auction.currentRoundId()).to.equal(2);
  });
});