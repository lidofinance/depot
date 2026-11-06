import { assert } from "chai";
import { keccak256, toHex } from "viem";
import { Burner_ABI } from "@/abi/Burner.abi";
import { contract, type Contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";

const configurations = {
  mainnet: {
    burner: "0xE76c52750019b80B43E36DF30bf4060EB73F573a",
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    locator: "0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb",
    csmAccounting: "0x4d72BFF1BeaC69925F8Bd12526a39BAAb069e5Da",
    curatedAccounting: "0x2F91e3A8C5d6593bf4F8403fCfeCcd62dF59f6F6",
  },
  hoodi: {
    burner: "0xb2c99cd38a2636a6281a849C8de938B3eF4A7C3D",
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    locator: "0xe2EF9536DAAAEBFf5b1c130957AB3E80056b06D8",
    csmAccounting: "0xA54b90BA34C5f326BC1485054080994e38FB4C60",
    curatedAccounting: "0x7f7356D29aCd915F1934220956c3305808ceB235",
  },
} as const;

describe("Burner acceptance", function () {
  let client: DevRpcClient;
  let burner: Contract<typeof Burner_ABI>;
  let expected: (typeof configurations)[keyof typeof configurations];

  before(async function () {
    const network = getAcceptanceNetwork(this);
    client = await connectAcceptanceClient(this, network);
    expected = configurations[network];
    burner = contract(Burner_ABI, expected.burner);
  });

  it("has the expected Lido and locator connections", async function () {
    assert.equal((await client.read(burner, "LIDO")).toLowerCase(), expected.lido.toLowerCase(), "Lido");
    assert.equal((await client.read(burner, "LOCATOR")).toLowerCase(), expected.locator.toLowerCase(), "locator");
  });

  it("has the expected CSM and Curated accounting burn permissions", async function () {
    const requestBurnSharesRole = keccak256(toHex("REQUEST_BURN_SHARES_ROLE"));
    const requestBurnMyStethRole = keccak256(toHex("REQUEST_BURN_MY_STETH_ROLE"));
    assert.isFalse(
      await client.read(burner, "hasRole", [requestBurnSharesRole, expected.csmAccounting]),
      "CSM accounting cannot request burning arbitrary shares",
    );
    assert.isTrue(
      await client.read(burner, "hasRole", [requestBurnMyStethRole, expected.csmAccounting]),
      "CSM accounting can request burning its stETH",
    );
    assert.isTrue(
      await client.read(burner, "hasRole", [requestBurnMyStethRole, expected.curatedAccounting]),
      "Curated accounting can request burning its stETH",
    );
  });
});
