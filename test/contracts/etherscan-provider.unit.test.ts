import { assert } from "chai";
import sinon from "sinon";
import bytes from "../../src/common/bytes";
import {
  deps,
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

function verifiedContract(name: string) {
  return {
    status: "1",
    message: "OK",
    result: [
      {
        SourceCode: "contract A {}",
        ABI: "[]",
        ContractName: name,
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
}

function mockFetchSequence(...attempts: (() => Response)[]) {
  let callIndex = 0;
  const originalFetch = globalThis.fetch;
  // async required to match globalThis.fetch return type (Promise<Response>)
  // eslint-disable-next-line @typescript-eslint/require-await
  globalThis.fetch = (async () => {
    const attempt = attempts[Math.min(callIndex, attempts.length - 1)];
    callIndex++;
    return attempt();
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

  beforeEach(() => {
    sinon.stub(deps, "sleep").resolves();
  });

  afterEach(() => {
    sinon.restore();
    restoreFetch?.();
    restoreFetch = undefined;
  });

  it("retries on HTTP 429 and backs off exponentially", async () => {
    const originalFetch = globalThis.fetch;
    let callIndex = 0;
    // eslint-disable-next-line @typescript-eslint/require-await
    globalThis.fetch = (async () => {
      callIndex++;
      if (callIndex < 3) {
        return new Response("Too Many Requests", { status: 429, statusText: "Too Many Requests" });
      }
      const success = {
        status: "1",
        message: "OK",
        result: [
          {
            SourceCode: "contract A {}",
            ABI: "[]",
            ContractName: "AfterHttp429",
            CompilerVersion: "v0.8.20",
            OptimizationUsed: "1",
            Runs: "200",
            ConstructorArguments: "",
            EVMVersion: "paris",
            Proxy: "0",
            Implementation: "",
          },
        ],
      };
      return new Response(JSON.stringify(success), { status: 200 });
    }) as typeof globalThis.fetch;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);

    assert.equal(res.name, "AfterHttp429");
    assert.equal(callIndex, 3);
    const sleep = deps.sleep as sinon.SinonStub;
    assert.deepEqual(
      sleep.getCalls().map((call) => call.args[0]),
      [500, 1000],
    );
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

  it("retries on HTTP 5xx and eventually succeeds", async () => {
    const mock = mockFetchSequence(
      () => new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" }),
      () => new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" }),
      () => new Response(JSON.stringify(verifiedContract("After5xx")), { status: 200 }),
    );
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);

    assert.equal(mock.callCount(), 3);
    assert.equal(res.name, "After5xx");
  });

  it("retries when the body is not JSON", async () => {
    const mock = mockFetchSequence(
      () => new Response("<html>Just a moment...</html>", { status: 200 }),
      () => new Response(JSON.stringify(verifiedContract("AfterHtml")), { status: 200 }),
    );
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);

    assert.equal(mock.callCount(), 2);
    assert.equal(res.name, "AfterHtml");
  });

  it("retries when the request itself fails", async () => {
    const mock = mockFetchSequence(
      () => {
        throw new Error("fetch failed: ECONNRESET");
      },
      () => new Response(JSON.stringify(verifiedContract("AfterNetworkError")), { status: 200 }),
    );
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);

    assert.equal(mock.callCount(), 2);
    assert.equal(res.name, "AfterNetworkError");
  });

  it("retries when reading the response body fails", async () => {
    const mock = mockFetchSequence(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError("terminated"));
            },
          }),
        ),
      () => new Response(JSON.stringify(verifiedContract("AfterBodyError")), { status: 200 }),
    );
    restoreFetch = mock.restore;

    const res = await provider.request(NETWORK_NAME, CONTRACT_ADDRESS);

    assert.equal(mock.callCount(), 2);
    assert.equal(res.name, "AfterBodyError");
  });

  it("gives up on a persistent outage with the last failure in the message", async () => {
    const mock = mockFetchSequence(
      () => new Response("<html>Just a moment...</html>", { status: 503, statusText: "Service Unavailable" }),
    );
    restoreFetch = mock.restore;

    await assert.isRejected(
      provider.request(NETWORK_NAME, CONTRACT_ADDRESS),
      `Etherscan is unavailable, tried ${MAX_ATTEMPTS} times:\nHTTP 503 Service Unavailable`,
    );
    assert.equal(mock.callCount(), MAX_ATTEMPTS);
  });

  it("names the network and address of an unverified contract", async () => {
    const mock = mockFetchResponses({ status: "0", message: "NOTOK", result: "Contract source code not verified" });
    restoreFetch = mock.restore;

    await assert.isRejected(
      provider.request(NETWORK_NAME, CONTRACT_ADDRESS),
      `Contract is not verified: ${NETWORK_NAME} ${CONTRACT_ADDRESS}`,
    );
  });

  it("recognizes an unverified contract reported inside an OK response", async () => {
    const unverified = verifiedContract("");
    unverified.result[0].ABI = "Contract source code not verified";
    const mock = mockFetchResponses(unverified);
    restoreFetch = mock.restore;

    await assert.isRejected(
      provider.request(NETWORK_NAME, CONTRACT_ADDRESS),
      `Contract is not verified: ${NETWORK_NAME} ${CONTRACT_ADDRESS}`,
    );
  });

  it("fails clearly when Etherscan returns an empty result", async () => {
    const mock = mockFetchResponses({ status: "1", message: "OK", result: [] });
    restoreFetch = mock.restore;

    await assert.isRejected(
      provider.request(NETWORK_NAME, CONTRACT_ADDRESS),
      `Etherscan returned no contract info for ${NETWORK_NAME} ${CONTRACT_ADDRESS}`,
    );
  });

  it("explains a rejected API key", async () => {
    const mock = mockFetchResponses({ status: "0", message: "NOTOK", result: "Missing/Invalid API Key" });
    restoreFetch = mock.restore;

    await assert.isRejected(provider.request(NETWORK_NAME, CONTRACT_ADDRESS), /rejected the API key/);
  });
});
