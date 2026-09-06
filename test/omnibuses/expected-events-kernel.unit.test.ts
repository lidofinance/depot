import { assert } from "chai";

import { expectedEvents } from "../../src/omnibuses/expected-events";
import { getGovernanceContracts } from "../../src/omnibuses/governance-contracts";

describe("Kernel expected events", () => {
  it("checks the app base namespace, app ID and new implementation", () => {
    const { kernel } = getGovernanceContracts("mainnet");
    const appId = "0x3ca7c3e38968823ccb4c78ea688df41356f182ae1d159e4ee608d30d68cef320";
    const implementation = "0x0000000000000000000000000000000000000702";
    const [event] = expectedEvents.kernel.appImplementationUpdated(kernel, { appId, implementation });

    assert.equal(event.abi.name, "SetApp");
    assert.equal(event.emitter, kernel.address);
    assert.deepEqual(event.args, [
      "0xf1f3eb40f5bc1ad1344716ced8b8a0431d840b5783aea1fd01786bc26f35ac0f",
      appId,
      implementation,
    ]);
    assert.isFalse(event.isOptional);
  });
});
