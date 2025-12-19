import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("当前网络的签名者地址:", signer.address);
}

main().catch(console.error);

