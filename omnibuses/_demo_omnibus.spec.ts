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

  let balanceBefore: BigNumberish;

  // Actions inputs
  const receiver = "0x17F6b2C738a63a8D3A113a228cfd0b373244633D";
  const amount = 180000n * 10n ** 18n;
  const expectedTargetShare = 400 as BigNumberish;

  before(async () => {
    balanceBefore = await contracts.ldo.balanceOf(receiver);

    try {
      await votes
        .adopt(provider, omnibus.script, omnibus.description, { gasLimit: 30_000_000 })
        .then((r) => r.enactReceipt);
    } catch (e) {
      assert.fail(`Failed to adopt the vote: ${e}`);
    }
  });

  it(`assure that assets was transferred successfully`, async () => {
    const balanceAfter = await contracts.ldo.balanceOf(receiver);
    const expectedBalance = BigInt(balanceBefore) + BigInt(amount);

    assert.equal(expectedBalance, balanceAfter);
  });

  it(`assure that staking module target share was updated successfully`, async () => {
    const summary = await contracts.stakingRouter.getStakingModule(StakingModule.SimpleDVT);

    assert.equal(expectedTargetShare, summary.targetShare);
  });
});
