import { assert } from "../src/common/assert";
import { BigNumberish, JsonRpcProvider } from "ethers";
import networks, { NetworkName } from "../src/networks";
import votes from "../src/votes";
import { before } from "mocha";
import { Omnibus } from "../src/omnibuses/omnibus";
import lido from "../src/lido";
import { StakingModule } from "../src/lido/lido";

describe("Test _demo_omnibus", async () => {
  const omnibus: Omnibus<NetworkName> = require(`../omnibuses/_demo_omnibus.ts`).default;
  const url = networks.localRpcUrl("eth");
  const provider = new JsonRpcProvider(url);
  const contracts = lido.eth[omnibus.network](provider);
  omnibus.init(provider);

  // State before
  let balanceBefore: BigNumberish;
  let nodeOperatorsCountBefore: BigNumberish;

  // Actions inputs
  const receiver = "0x17F6b2C738a63a8D3A113a228cfd0b373244633D";
  const amount = 180000n * 10n ** 18n;
  const expectedTargetShare = 400 as BigNumberish;
  const addedOperators = [
    {
      name: "A41",
      rewardAddress: "0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7",
    },
    {
      name: "Develp GmbH",
      rewardAddress: "0x0a6a0b60fFeF196113b3530781df6e747DdC565e",
    },
    {
      name: "Ebunker",
      rewardAddress: "0x2A2245d1f47430b9f60adCFC63D158021E80A728",
    },
    {
      name: "Gateway.fm AS",
      rewardAddress: "0x78CEE97C23560279909c0215e084dB293F036774",
    },
    {
      name: "Numic",
      rewardAddress: "0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC",
    },
    {
      name: "ParaFi Technologies LLC",
      rewardAddress: "0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7",
    },
    {
      name: "RockawayX Infra",
      rewardAddress: "0xcA6817DAb36850D58375A10c78703CE49d41D25a",
    },
  ];

  // Preparation step
  before(async () => {
    balanceBefore = await contracts.ldo.balanceOf(receiver);
    nodeOperatorsCountBefore = await contracts.curatedStakingModule.getNodeOperatorsCount();

    try {
      await votes
        .adopt(provider, omnibus.script, omnibus.description, { gasLimit: 30_000_000 })
        .then((r) => r.enactReceipt);
    } catch (e) {
      assert.fail(`Failed to adopt the vote: ${e}`);
    }
  });

  // Tests
  it(`assure that assets was transferred successfully`, async () => {
    const balanceAfter = await contracts.ldo.balanceOf(receiver);
    const expectedBalance = BigInt(balanceBefore) + BigInt(amount);

    assert.equal(expectedBalance, balanceAfter);
  });

  it(`assure that staking module target share was updated successfully`, async () => {
    const summary = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);

    assert.equal(expectedTargetShare, summary.targetShare);
  });

  it(`assure that node operators were added successfully`, async () => {
    const nodeOperatorsCountAfter = await contracts.curatedStakingModule.getNodeOperatorsCount();

    assert.equal(BigInt(nodeOperatorsCountBefore) + BigInt(addedOperators.length), nodeOperatorsCountAfter);
  });
});
