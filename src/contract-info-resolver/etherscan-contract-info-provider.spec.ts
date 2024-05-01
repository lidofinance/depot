import nock from "nock";
import { assert } from "chai";

import env from "helpers/env";
import bytes from "helpers/bytes";
import { EtherscanContractInfoProvider } from "./etherscan-contract-info-provider";
import { BUILTIN_ETHERSCAN_CHAINS } from "./etherscan-chains-config";

const CHAIN_ID = 1;
const ETHERSCAN_API_URL = BUILTIN_ETHERSCAN_CHAINS.find((chain) => chain.chainId === CHAIN_ID);

const FLATTENED_CONTRACT_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

describe("EtherscanAbiResolver", () => {
  nock(ETHERSCAN_API_URL!.urls.apiURL)
    .get(new RegExp(".*"))
    .reply((uri) => {
      const address = uri
        .split("&")
        .find((q) => q.startsWith("address="))
        ?.replace("address=", "");
      if (!address) {
        throw new Error("Address wasn't passed");
      }
      const response = (ETHERSCAN_RESPONSES_MOCK as Record<string, any>)[address];
      return [200, response];
    })
    .persist();

  before(async () => {
    if (!ETHERSCAN_API_URL) {
      throw new Error(`Etherscan chain config for chain id ${CHAIN_ID} not found`);
    }
  });

  const abiProvider = new EtherscanContractInfoProvider("fake_api_key");

  it("The verified non proxy contract (flattened)", async () => {
    const [res, err] = await abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS);

    assert.isNull(err);
    assert.isNotNull(res);

    const etherscanResponse = ETHERSCAN_RESPONSES_MOCK[FLATTENED_CONTRACT_ADDRESS].result[0];
    assert.equal(JSON.stringify(res!.abi), etherscanResponse.ABI);
    assert.equal(res!.compilerVersion, etherscanResponse.CompilerVersion);
    assert.equal(res!.constructorArgs, bytes.normalize(etherscanResponse.ConstructorArguments));
    assert.equal(res!.evmVersion, etherscanResponse.EVMVersion);
    if (etherscanResponse.Implementation === "") {
      assert.isNull(res!.implementation);
    } else {
      assert.equal(res!.implementation, etherscanResponse.Implementation);
    }
    assert.equal(res!.name, etherscanResponse.ContractName);
    assert.equal(
      res!.sourceCode,
      JSON.stringify({
        language: "Solidity",
        sources: {
          [etherscanResponse.ContractName + ".sol"]: etherscanResponse.SourceCode,
        },
        settings: {
          libraries: {},
          outputSelection: {
            "*": {
              "": ["ast"],
              "*": ["metadata", "evm.bytecode", "evm.bytecode.sourceMap"],
            },
          },
          evmVersion: etherscanResponse.EVMVersion,
          optimizer: {
            enabled: etherscanResponse.OptimizationUsed === "1",
            runs: etherscanResponse.Runs,
          },
        },
      }),
    );
  });
  it.skip("The verified non proxy contract (standard json input)", async () => {
    const result = await abiProvider.request(CHAIN_ID, "0xD15a672319Cf0352560eE76d9e89eAB0889046D3");
  });
  it.skip("The verified non proxy contract (multi part files)", async () => {
    const result = await abiProvider.request(CHAIN_ID, "0x92a27C4e5e35cFEa112ACaB53851Ec70e2D99a8D");
  });
  it.skip("The verified proxy contract");
  it.skip("Unverified contract");
  it.skip("Empty bytecode address");
  it.skip("Vyper contract", async () => {
    const result = await abiProvider.request(CHAIN_ID, "0x1aD5cb2955940F998081c1eF5f5F00875431aA90");
  });
  it.skip("Yul contract");
});

const ETHERSCAN_RESPONSES_MOCK = {
  [FLATTENED_CONTRACT_ADDRESS]: {
    status: "1",
    message: "OK",
    result: [
      {
        SourceCode: "contract A {}",
        ABI: '[{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}]',
        ContractName: "Flattened",
        CompilerVersion: "v0.6.12+commit.27d51765",
        OptimizationUsed: "1",
        Runs: "200",
        ConstructorArguments: "000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84",
        EVMVersion: "Default",
        Library: "",
        LicenseType: "GNU GPLv3",
        Proxy: "0",
        Implementation: "",
        SwarmSource: "ipfs://186e50b7fede392854c0f7a5c7a0ca06364c7a59f763103f5fdc8e825f75be23",
      },
    ],
  },
};
