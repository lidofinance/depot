import { assert } from "../src/common/assert";
import { JsonRpcProvider } from "ethers";
import { Suite } from "mocha";
import { Omnibus } from "../src/omnibuses/omnibus";
import { TransferAssets } from "../src/omnibuses/actions/transfer-assets";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";
import { StakingModule } from "../src/lido/lido";
import { enactOmnibus, validateVotingEvents } from "../src/omnibuses/tools/test";
import networks, { NetworkName } from "../src/networks";
import lido from "../src/lido";

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

  // Checking if all actions are included in the test suite...
  it("All actions are included in the test suite", async () => {
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

  // Running before hooks & checks for the omnibus...
  const actionsSuite = Suite.create(this, "Testing omnibus actions...");
  actionsSuite.beforeAll(async () => {
    await actions.transferAssets.before();
    await actions.updateStakingModule.before();

    actionsSuite.ctx.enactReceipt = await enactOmnibus(omnibus, provider);
  });

  // Testing TransferAssets action...
  const transferAssetsSuite = Suite.create(actionsSuite, "Testing TransferAssets action...");
  (await actions.transferAssets.tests()).forEach((test) => transferAssetsSuite.addTest(test));

  // Testing UpdateStakingModule action...
  const updateStakingModuleSuite = Suite.create(actionsSuite, "Testing UpdateStakingModule action...");
  (await actions.updateStakingModule.tests(contracts)).forEach((test) => updateStakingModuleSuite.addTest(test));

  // Validating the voting items...
  const validateEventsSuite = Suite.create(actionsSuite, "Validating the omnibus events");
  await validateVotingEvents(omnibus, validateEventsSuite);
});
