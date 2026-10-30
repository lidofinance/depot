import { assert } from "chai";
import { toHex } from "viem";
import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { contract } from "@/src/contracts";
import { Omnibus, expectedEvents } from "@/src/omnibuses";

const LOCATOR = "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb";
const IMPLEMENTATION = "0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313";
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const TITLE = "Submit the Locator upgrade snapshot example";
const proxy = contract(OssifiableProxy_ABI, LOCATOR);

export default Omnibus.create({
  network: "mainnet",
  upgradeSnapshot: {
    suites: ["first-slots"],
    storage: [{ address: LOCATOR, slot: IMPLEMENTATION_SLOT }],
    expectedChanges: {
      [`first-slots/init/${LOCATOR.toLowerCase()}/${IMPLEMENTATION_SLOT}`]: {
        after: toHex(BigInt(IMPLEMENTATION), { size: 32 }),
      },
    },
  },
  testVote: async ({ client, passOmnibus }) => {
    const before = await client.read(proxy, "proxy__getImplementation");
    assert.notEqual(before.toLowerCase(), IMPLEMENTATION.toLowerCase(), "Locator is already upgraded");
    const code = await client.viemClient.getCode({ address: IMPLEMENTATION });
    assert.isTrue(code !== undefined && code !== "0x", "new Locator implementation exists at the fork block");
    const { voteEvents } = await passOmnibus();
    voteEvents.item(TITLE);
    assert.equal(await client.read(proxy, "proxy__getImplementation"), before, "upgrade awaits DG execution");
  },
  testProposal: async ({ client, passProposals }) => {
    const { proposalEvents } = await passProposals();
    proposalEvents[0].call(0, expectedEvents.proxy.upgraded(proxy, { implementation: IMPLEMENTATION }));
    assert.equal((await client.read(proxy, "proxy__getImplementation")).toLowerCase(), IMPLEMENTATION.toLowerCase());
  },
});
