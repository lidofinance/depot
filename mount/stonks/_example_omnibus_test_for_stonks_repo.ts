// @ts-nocheck
import { expect } from "chai";
import hre from "hardhat";

describe("Fast tests for testing CI integration", () => {
  it("Check the fork node behind the localhost network responds", async () => {
    const blockNumber = await hre.network.provider.send("eth_blockNumber");
    const chainId = await hre.network.provider.send("eth_chainId");

    expect(Number.parseInt(blockNumber, 16)).to.be.greaterThan(0);
    expect(Number.parseInt(chainId, 16)).to.be.equal(1);
  });
});
