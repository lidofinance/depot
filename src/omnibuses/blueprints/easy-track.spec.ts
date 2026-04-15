import { assert } from "chai";
import bytes from "../../common/bytes";
import { toFunctionSelector } from "viem";
import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { Finance_ABI } from "../../../abi/Finance.abi";
import { getFunctionAbi, getLidoContracts } from "../../contracts/contracts";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { event } from "../omnibus";
import easyTrack, {
  addRecipientEVMScriptFactoryPermission,
  removeRecipientEVMScriptFactoryPermission,
  topUpEVMScriptFactoryPermission,
} from "./easy-track";

function createCtx() {
  const contracts = getLidoContracts("mainnet");
  return {
    contracts,
    event,
    directCall: OmnibusDirectCall.createCallBuilder({ voting: contracts.voting, callsScript: contracts.callsScript }),
  } as any;
}

describe("easy-track blueprints", () => {
  it("removeEvmScriptFactory creates expected direct call", () => {
    const ctx = createCtx();
    const factory = "0x1111111111111111111111111111111111111111";
    const call = easyTrack.removeEvmScriptFactory(ctx, { title: "Remove factory", factory });

    assert.equal(call.title, "Remove factory");
    assert.equal(call.functionName, "removeEVMScriptFactory");
    assert.deepEqual(call.args, [factory]);

    const events = call.getEventsFor("proposal");
    assert.equal(events[0].abi.name, "EVMScriptFactoryRemoved");
    assert.deepEqual(events[0].args, [factory]);
  });

  it("addEvmScriptFactory creates expected direct call", () => {
    const ctx = createCtx();
    const factory = "0x1111111111111111111111111111111111111111";
    const permission = "0xabcdef" as const;
    const call = easyTrack.addEvmScriptFactory(ctx, {
      title: "Add factory",
      factory,
      permission,
    });

    assert.equal(call.title, "Add factory");
    assert.equal(call.functionName, "addEVMScriptFactory");
    assert.deepEqual(call.args, [factory, permission]);

    const events = call.getEventsFor("proposal");
    assert.equal(events[0].abi.name, "EVMScriptFactoryAdded");
    assert.deepEqual(events[0].args, [factory, permission]);
  });

  it("addTopUpEvmScriptFactory uses computed permission", () => {
    const ctx = createCtx();
    const factory = "0x1111111111111111111111111111111111111111";
    const registry = "0x2222222222222222222222222222222222222222";
    const call = easyTrack.addTopUpEvmScriptFactory(ctx, {
      title: "Add top up factory",
      factory,
      registry,
    });

    const expectedPermission = bytes.join(
      ...[
        ctx.contracts.finance.address,
        toFunctionSelector(getFunctionAbi(ctx.contracts.finance, "newImmediatePayment")),
      ],
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "updateSpentAmount"))],
    );

    assert.deepEqual(call.args, [factory, expectedPermission]);
  });

  it("add/remove recipient factories use expected permissions", () => {
    const ctx = createCtx();
    const factory = "0x1111111111111111111111111111111111111111";
    const registry = "0x2222222222222222222222222222222222222222";

    const addRecipientCall = easyTrack.addAddRecipientEvmScriptFactory(ctx, {
      title: "Add recipient factory",
      factory,
      registry,
    });
    const removeRecipientCall = easyTrack.addRemoveRecipientEvmScriptFactory(ctx, {
      title: "Remove recipient factory",
      factory,
      registry,
    });

    const addPermission = bytes.join(
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "addRecipient"))],
    );
    const removePermission = bytes.join(
      ...[registry, toFunctionSelector(getFunctionAbi({ abi: AllowedRecipientsRegistry_ABI }, "removeRecipient"))],
    );

    assert.deepEqual(addRecipientCall.args, [factory, addPermission]);
    assert.deepEqual(removeRecipientCall.args, [factory, removePermission]);
  });

  it("permission helper functions match ABI selectors", () => {
    const finance = "0x3333333333333333333333333333333333333333";
    const registry = "0x4444444444444444444444444444444444444444";

    const topUp = topUpEVMScriptFactoryPermission(finance, registry);
    const expectedTopUp = bytes.join(
      ...[finance, toFunctionSelector(getFunctionAbi({ abi: Finance_ABI }, "newImmediatePayment"))],
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
