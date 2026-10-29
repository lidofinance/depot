import { assert } from "chai";
import { rejects } from "node:assert/strict";
import { encodeErrorResult, zeroAddress } from "viem";
import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { WithdrawalQueue_ABI } from "@/abi/WithdrawalQueue.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { isRevertedWith } from "@/test/protocol/helpers/reverts";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";
import { getGovernanceContracts } from "@/src/omnibuses/governance-contracts";

const configurations = {
  mainnet: {
    queue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
    implementation: "0xE42C659Dc09109566720EA8b2De186c2Be7D94D9",
    admin: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    steth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    wsteth: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    baseUri: "https://wq-api.lido.fi/v1/nft",
  },
  hoodi: {
    queue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
    implementation: "0xD0a60e52837e045F4567193Cf8921191C486eCD5",
    admin: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    steth: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    wsteth: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
    baseUri: "https://wq-api-hoodi.testnet.fi/v1/nft",
  },
} as const;

describe("WithdrawalQueue acceptance", function () {
  let client: DevRpcClient;
  let queue: Contract<typeof WithdrawalQueue_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];
  let governance: ReturnType<typeof getGovernanceContracts>;

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    expected = configurations[network];
    governance = getGovernanceContracts(network);
    queue = contract(WithdrawalQueue_ABI, expected.queue);
  });

  it("has the expected proxy implementation and admin", async function () {
    const proxy = contract(OssifiableProxy_ABI, queue.address);
    assert.equal(
      (await client.read(proxy, "proxy__getImplementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(proxy, "proxy__getAdmin")).toLowerCase(), expected.admin.toLowerCase(), "admin");
  });

  it("has the expected contract version", async function () {
    assert.equal(await client.read(queue, "getContractVersion"), 1n, "contract version");
  });

  it("cannot initialize the proxy or petrified implementation again", async function () {
    const admin = await client.read(queue, "getRoleMember", [await client.read(queue, "DEFAULT_ADMIN_ROLE"), 0n]);
    const expectedRevert = encodeErrorResult({ abi: WithdrawalQueue_ABI, errorName: "NonZeroContractVersionOnInit" });
    for (const target of [queue, contract(WithdrawalQueue_ABI, expected.implementation)]) {
      await rejects(
        client.simulate(target, "initialize", [admin], { from: governance.voting.address }),
        (error: unknown) => isRevertedWith(error, expectedRevert),
        `initialize ${target.address}`,
      );
    }
  });

  it("is resumed and has bunker mode disabled", async function () {
    assert.isFalse(await client.read(queue, "isPaused"), "paused");
    assert.isTrue((await client.read(queue, "getResumeSinceTimestamp")) > 0n, "resume timestamp");
    assert.equal(
      await client.read(queue, "bunkerModeSinceTimestamp"),
      await client.read(queue, "BUNKER_MODE_DISABLED_TIMESTAMP"),
      "bunker mode",
    );
  });

  it("has the expected token connections", async function () {
    assert.equal((await client.read(queue, "WSTETH")).toLowerCase(), expected.wsteth.toLowerCase(), "wstETH");
    assert.equal((await client.read(queue, "STETH")).toLowerCase(), expected.steth.toLowerCase(), "stETH");
  });

  it("has the expected ERC721 metadata", async function () {
    assert.equal(await client.read(queue, "name"), "Lido: stETH Withdrawal NFT", "name");
    assert.equal(await client.read(queue, "symbol"), "unstETH", "symbol");
    assert.equal(await client.read(queue, "getBaseURI"), expected.baseUri, "base URI");
    assert.equal(await client.read(queue, "getNFTDescriptorAddress"), zeroAddress, "NFT descriptor");
  });
});
