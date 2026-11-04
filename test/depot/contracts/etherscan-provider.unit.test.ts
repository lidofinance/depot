import { assert } from "chai";
import sinon from "sinon";
import {
  deps,
  EtherscanContractInfoProvider,
  MAX_ATTEMPTS,
} from "@/src/contract-info-resolver/etherscan-contract-info-provider";

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

  it("throws when rate limit persists beyond max attempts", async () => {
    const rateLimited = { status: "0", message: "NOTOK", result: "Max rate limit reached" };
    const mock = mockFetchResponses(rateLimited); // always returns rate-limited
    restoreFetch = mock.restore;

    await assert.isRejected(
      provider.request(NETWORK_NAME, CONTRACT_ADDRESS),
      `Rate limit reached, tried ${MAX_ATTEMPTS} times`,
    );
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
});
