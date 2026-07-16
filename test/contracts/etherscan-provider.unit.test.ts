import { assert } from "chai";
import bytes from "../../src/common/bytes";
import {
  EtherscanContractInfoProvider,
  MAX_ATTEMPTS,
} from "../../src/contract-info-resolver/etherscan-contract-info-provider";

const NETWORK_NAME = "mainnet";
const CONTRACT_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

function mockFetchResponses(...responses: unknown[]) {
  let callIndex = 0;
  const originalFetch = globalThis.fetch;
  // async required to match globalThis.fetch return type (Promise<Response>)
  // eslint-disable-next-line @typescript-eslint/require-await
  globalThis.fetch = (async () => {
    const body = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return {
    callCount: () => callIndex,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe("EtherscanContractInfoProvider", () => {
  const provider = new EtherscanContractInfoProvider("fake_api_key");
  let restoreFetch: (() => void) | undefined;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  it("returns parsed contract info for verified contract", async () => {
    const response = {
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
          SwarmSource: "",
        },
      ],
    };

    const mock = mockFetchResponses(response);
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);

    assert.equal(res.name, "Flattened");
    assert.deepEqual(res.abi, JSON.parse(response.result[0].ABI));
    assert.equal(res.compilerVersion, response.result[0].CompilerVersion);
    assert.equal(res.constructorArgs, bytes.normalize(response.result[0].ConstructorArguments));
    assert.equal(res.evmVersion, response.result[0].EVMVersion);
    assert.isNull(res.implementation);
  });

  it("normalizes non-empty implementation address", async () => {
    const response = {
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: "contract A {}",
          ABI: "[]",
          ContractName: "ProxyLike",
          CompilerVersion: "v0.8.20+commit.a1b79de6",
          OptimizationUsed: "1",
          Runs: "200",
          ConstructorArguments: "",
          EVMVersion: "paris",
          Library: "",
          LicenseType: "MIT",
          Proxy: "1",
          Implementation: "0x00000000000000000000000000000000000000AA",
          SwarmSource: "",
        },
      ],
    };

    const mock = mockFetchResponses(response);
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);
    assert.equal(res.implementation, "0x00000000000000000000000000000000000000aa");
  });

  it("throws for unverified contracts", async () => {
    const mock = mockFetchResponses({
      status: "0",
      message: "NOTOK",
      result: "Contract source code not verified",
    });
    restoreFetch = mock.restore;

    await assert.isRejected(provider.request(NETWORK_NAME, CONTRACT_ADDRESS), "Contract is not verified");
  });

  it("retries on rate-limit and eventually succeeds", async () => {
    const rateLimited = { status: "0", message: "NOTOK", result: "Max rate limit reached" };
    const success = {
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: "contract A {}",
          ABI: "[]",
          ContractName: "AfterRetry",
          CompilerVersion: "v0.8.20+commit.a1b79de6",
          OptimizationUsed: "1",
          Runs: "200",
          ConstructorArguments: "",
          EVMVersion: "paris",
          Library: "",
          LicenseType: "MIT",
          Proxy: "0",
          Implementation: "",
          SwarmSource: "",
        },
      ],
    };

    const mock = mockFetchResponses(rateLimited, rateLimited, success);
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);

    assert.equal(mock.callCount(), 3);
    assert.equal(res.name, "AfterRetry");
  });

  it("throws when rate limit persists beyond max attempts", async () => {
    const rateLimited = { status: "0", message: "NOTOK", result: "Max rate limit reached" };
    const mock = mockFetchResponses(rateLimited); // always returns rate-limited
    restoreFetch = mock.restore;

    await assert.isRejected(
      provider.request(NETWORK_NAME, CONTRACT_ADDRESS),
      `Rate limit reached, tried ${MAX_ATTEMPTS} times`,
    );
  });

  it("returns flattened sourceCode as JSON with settings", async () => {
    const response = {
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: "contract A {}",
          ABI: "[]",
          ContractName: "Flattened",
          CompilerVersion: "v0.6.12+commit.27d51765",
          OptimizationUsed: "1",
          Runs: "200",
          ConstructorArguments: "",
          EVMVersion: "Default",
          Library: "",
          LicenseType: "MIT",
          Proxy: "0",
          Implementation: "",
          SwarmSource: "",
        },
      ],
    };

    const mock = mockFetchResponses(response);
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);
    const parsed = JSON.parse(res.sourceCode);

    assert.equal(parsed.language, "Solidity");
    assert.deepEqual(parsed.sources, { "Flattened.sol": "contract A {}" });
    assert.equal(parsed.settings.evmVersion, "Default");
    assert.deepEqual(parsed.settings.optimizer, { enabled: true, runs: "200" });
  });

  it("throws for unexpected etherscan response format", async () => {
    const mock = mockFetchResponses({
      status: "1",
      message: "OK",
      result: "Unexpected result format",
    });
    restoreFetch = mock.restore;

    await assert.isRejected(provider.request(NETWORK_NAME, CONTRACT_ADDRESS), "Unexpected Etherscan Response");
  });

  it("throws for unsupported network", async () => {
    await assert.isRejected(provider.request("unknown" as any, CONTRACT_ADDRESS), "Unsupported chain unknown");
  });
});
