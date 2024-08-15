import { assert } from "../src/common/assert";
import { JsonRpcProvider } from "ethers";
import networks, { NetworkName } from "../src/networks";
import votes from "../src/votes";
import { before, Suite, Test } from "mocha";
import { Omnibus } from "../src/omnibuses/omnibus";
import lido from "../src/lido";
import { TransferAssets } from "../src/omnibuses/actions/transfer-assets";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";
import { StakingModule } from "../src/lido/lido";

describe("Test _demo_omnibus", async function () {
  const omnibus: Omnibus<NetworkName> = require(`../omnibuses/_demo_omnibus.ts`).default;
  const url = networks.localRpcUrl("eth");
  const provider = new JsonRpcProvider(url);
  const contracts = lido.eth[omnibus.network](provider);

  omnibus.init(provider);

  const actions = {
    transferAssets: new TransferAssets({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
      token: contracts.ldo,
      amount: 180000n * 10n ** 18n,
    }),
    updateStakingModule: new UpdateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%",
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 400,
      treasuryFee: 800,
      stakingModuleFee: 200,
    }),
  };

  // Preparation step
  before(async () => {
    await actions.transferAssets.before();
    await actions.updateStakingModule.before();

    try {
      await votes
        .adopt(provider, omnibus.script, omnibus.description, { gasLimit: 30_000_000 })
        .then((r) => r.enactReceipt);
    } catch (e) {
      assert.fail(`Failed to adopt the vote: ${e}`);
    }
  });

  it("all actions are included in the test suite", async () => {
    const absentActions = omnibus.actions
      .map((action) => {
        if (!Object.values(actions).filter((test) => test.constructor.name === action.constructor.name).length) {
          return action.constructor.name;
        }
      })
      .filter((action) => action);

    assert.isEmpty(
      absentActions,
      `The following actions are not included in the test suite:\n\n${absentActions.join("\n")}\n\n`,
    );
  });

  const transferAssetsSuite = Suite.create(this, "Transfer assets");
  (await actions.transferAssets.tests()).forEach((test) => transferAssetsSuite.addTest(test));

  const updateStakingModuleSuite = Suite.create(this, "Update staking module");
  (await actions.updateStakingModule.tests(contracts)).forEach((test) => updateStakingModuleSuite.addTest(test));
});
