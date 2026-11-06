import { assert } from "chai";
import sinon from "sinon";
import { deps, EtherscanContractInfoProvider } from "@/src/contract-info-resolver/etherscan-contract-info-provider";

const NETWORK_NAME = "mainnet";
const CONTRACT_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";

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
});
