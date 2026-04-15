import { assert } from "chai";
import bytes from "../../common/bytes";
import { toFunctionSelector } from "viem";
import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { EasyTrack_ABI } from "../../../abi/EasyTrack.abi";
import { Finance_ABI } from "../../../abi/Finance.abi";
import { contract, getFunctionAbi } from "../../contracts";
import { getGovernanceContracts } from "../governance-contracts";
import { OmnibusDirectCallFactory } from "../calls/omnibus-direct-call";
import { event, BlueprintCtx } from "../omnibus";
import easyTrack, {
  addRecipientEVMScriptFactoryPermission,
  removeRecipientEVMScriptFactoryPermission,
  topUpEVMScriptFactoryPermission,
} from "./easy-track";

function createCtx(): BlueprintCtx {
  const { voting, callsScript } = getGovernanceContracts("mainnet");
  const factory = new OmnibusDirectCallFactory(voting, callsScript);
  return {
    event,
    directCall: factory.create.bind(factory),
  };
}

const easyTrackContract = contract(EasyTrack_ABI, "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea");
const finance = contract(Finance_ABI, "0xB9E5CBB9CA5b0d659238807E84D0176930753d86");

describe("easy-track blueprints", () => {
  it("removeEvmScriptFactory creates expected direct call", () => {
    const ctx = createCtx();
    const factory = "0x1111111111111111111111111111111111111111";
    const call = easyTrack.removeEvmScriptFactory(
      ctx,
      { easyTrack: easyTrackContract },
      { title: "Remove factory", factory },
    );

    assert.equal(call.title, "Remove factory");
    assert.equal(call.input.fn, "removeEVMScriptFactory");
    assert.deepEqual(call.input.args, [factory]);

    const events = call.getExpectedEvents("proposal");
    const removed = events.find((e) => e.abi.name === "EVMScriptFactoryRemoved")!;
    assert.deepEqual(removed.args, [factory]);
  });

  it("addEvmScriptFactory creates expected direct call", () => {
    const ctx = createCtx();
    const factory = "0x1111111111111111111111111111111111111111";
    const permission = "0xabcdef" as const;
    const call = easyTrack.addEvmScriptFactory(
      ctx,
      { easyTrack: easyTrackContract },
      {
        title: "Add factory",
        factory,
        permission,
      },
    );

    assert.equal(call.title, "Add factory");
    assert.equal(call.input.fn, "addEVMScriptFactory");
    assert.deepEqual(call.input.args, [factory, permission]);

    const events = call.getExpectedEvents("proposal");
    const added = events.find((e) => e.abi.name === "EVMScriptFactoryAdded")!;
    assert.deepEqual(added.args, [factory, permission]);
  });

  it("addTopUpEvmScriptFactory uses computed permission", () => {
    const ctx = createCtx();
    const factoryAddr = "0x1111111111111111111111111111111111111111";
    const registry = "0x2222222222222222222222222222222222222222";
    const call = easyTrack.addTopUpEvmScriptFactory(
      ctx,
      { easyTrack: easyTrackContract, finance },
      {
        title: "Add top up factory",
        factory: factoryAddr,
        registry,
      },
    );

    const expectedPermission = bytes.join(
      ...[finance.address, toFunctionSelector(getFunctionAbi(finance, "newImmediatePayment"))],
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "updateSpentAmount"))],
    );

    assert.deepEqual(call.input.args, [factoryAddr, expectedPermission]);
  });

  it("add/remove recipient factories use expected permissions", () => {
    const ctx = createCtx();
    const factoryAddr = "0x1111111111111111111111111111111111111111";
    const registry = "0x2222222222222222222222222222222222222222";

    const addRecipientCall = easyTrack.addAddRecipientEvmScriptFactory(
      ctx,
      { easyTrack: easyTrackContract },
      {
        title: "Add recipient factory",
        factory: factoryAddr,
        registry,
      },
    );
    const removeRecipientCall = easyTrack.addRemoveRecipientEvmScriptFactory(
      ctx,
      { easyTrack: easyTrackContract },
      {
        title: "Remove recipient factory",
        factory: factoryAddr,
        registry,
      },
    );

    const addPermission = bytes.join(
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient"))],
    );
    const removePermission = bytes.join(
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "removeRecipient"))],
    );

    assert.deepEqual(addRecipientCall.input.args, [factoryAddr, addPermission]);
    assert.deepEqual(removeRecipientCall.input.args, [factoryAddr, removePermission]);
  });

  it("permission helper functions match ABI selectors", () => {
    const financeAddr = "0x3333333333333333333333333333333333333333";
    const registry = "0x4444444444444444444444444444444444444444";

    const topUp = topUpEVMScriptFactoryPermission(financeAddr, registry);
    const expectedTopUp = bytes.join(
      ...[financeAddr, toFunctionSelector(getFunctionAbi({ abi: Finance_ABI }, "newImmediatePayment"))],
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "updateSpentAmount"))],
    );
    assert.equal(topUp, expectedTopUp);

    const addRecipient = addRecipientEVMScriptFactoryPermission(registry);
    const expectedAddRecipient = bytes.join(
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient"))],
    );
    assert.equal(addRecipient, expectedAddRecipient);

    const removeRecipient = removeRecipientEVMScriptFactoryPermission(registry);
    const expectedRemoveRecipient = bytes.join(
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "removeRecipient"))],
    );
    assert.equal(removeRecipient, expectedRemoveRecipient);
  });
});
