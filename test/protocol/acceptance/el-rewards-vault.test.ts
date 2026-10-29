import { assert } from "chai";
import { parseAbi } from "viem";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";

const vaultAbi = parseAbi(["function LIDO() view returns (address)", "function TREASURY() view returns (address)"]);

const configurations = {
  mainnet: {
    vault: "0x388C818CA8B9251b393131C08a736A67ccB19297",
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    treasury: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
  },
  hoodi: {
    vault: "0x9b108015fe433F173696Af3Aa0CF7CDb3E104258",
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    treasury: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
  },
} as const;

describe("ELRewardsVault acceptance", function () {
  let client: DevRpcClient;
  let vault: Contract<typeof vaultAbi>;
  let expected: (typeof configurations)[keyof typeof configurations];

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    expected = configurations[network];
    vault = contract(vaultAbi, expected.vault);
  });

  it("has the expected Lido and treasury connections", async function () {
    assert.equal((await client.read(vault, "LIDO")).toLowerCase(), expected.lido.toLowerCase(), "Lido");
    assert.equal((await client.read(vault, "TREASURY")).toLowerCase(), expected.treasury.toLowerCase(), "treasury");
  });
});
