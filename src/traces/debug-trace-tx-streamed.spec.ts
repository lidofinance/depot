import { assert } from "chai";
import { IssuableERC20, IssuableERC20__factory } from "../../typechain-types";
import providers, { ProviderCheats, SignerWithAddress } from "../providers";
import rpcs, { SpawnedRpcNode } from "../rpcs";
import { DebugTraceTxStreamed, TraceParameters } from "./debug-trace-tx-streamed";
import { get } from "lodash";

async function streamDebutTraceTransaction(node: SpawnedRpcNode, hash: string, params: TraceParameters) {
  const res: any = {
    gas: -1,
    failed: false,
    returnValue: "",
    structLogs: [],
  };
  const tracer = new DebugTraceTxStreamed({
    structLog: (log) => res.structLogs.push(log),
    gas: (gas) => (res.gas = gas),
    returnValue: (returnValue) => (res.returnValue = returnValue),
    error: (error) => {
      res.failed = true;
      res.error = error;
    },
  });
  await tracer.trace(node.url, hash, params);
  return res;
}

async function debugTraceTransaction(node: SpawnedRpcNode, hash: string, params: TraceParameters) {
  const specificParams =
    node.name === "hardhat"
      ? {
          disableStack: params.disableStack ?? false,
          disableStorage: params.disableStorage ?? false,
          disableMemory: params.enableMemory === true ? false : true,
          disableReturnData: params.enableReturnData === true ? false : true,
        }
      : {
          disableStack: params.disableStack ?? false,
          disableStorage: params.disableStorage ?? false,
          enableMemory: params.enableMemory ?? false,
          enableReturnData: params.enableReturnData ?? false,
        };
  return node.provider.send("debug_traceTransaction", [hash, specificParams]);
}

interface TestContext {
  node: SpawnedRpcNode;
  token: IssuableERC20;
  cheats: ProviderCheats;
  owner: SignerWithAddress;
}

const RPC_NODES = [
  ["anvil", { port: 8544, stepsTracing: true }],
  ["hardhat", { port: 8545 }],
];

// prettier-ignore
const TRACE_OPTIONS: TraceParameters[] = [
  { disableStack: false, disableStorage: false, enableMemory: false, enableReturnData: false },
  { disableStack: false, disableStorage: false, enableMemory: false, enableReturnData:  true },
  { disableStack: false, disableStorage: false, enableMemory:  true, enableReturnData:  true },
  { disableStack: false, disableStorage:  true, enableMemory:  true, enableReturnData:  true },
  { disableStack:  true, disableStorage:  true, enableMemory:  true, enableReturnData:  true },
];

// TODO: add tests for "geth" and "erigon" nodes
describe.skip("DebugTraceTxStreamed", () => {
  let nodes: SpawnedRpcNode[];
  const contexts: TestContext[] = [];

  before(async () => {
    nodes = await Promise.all(RPC_NODES.map((config) => rpcs.spawn(...(config as [any]))));

    for (let node of nodes) {
      const cheats = providers.cheats(node.provider);
      const [owner] = await cheats.signers();
      const token = await new IssuableERC20__factory(owner).deploy(owner, "Test Token", "TT");
      contexts.push({ node, token, cheats, owner });
    }
  });

  after(async () => {
    await Promise.all(contexts.map((c) => c.node.stop()));
  });

  for (let i = 0; i < RPC_NODES.length; ++i) {
    describe(`Testing the result matches regular debug_traceTransaction call on "${RPC_NODES[i][0]}" node`, () => {
      let successTxHash: string;
      let revertedTxHash: string;

      before(async () => {
        const node = nodes[i];
        const cheats = providers.cheats(node.provider);
        const [owner] = await cheats.signers();
        const token = await new IssuableERC20__factory(owner).deploy(owner, "Test Token", "TT");
        const tx = await token.connect(owner).mintWithResult(owner, 10n ** 18n);
        await tx.wait();
        successTxHash = tx.hash;

        try {
          const [, stranger] = await cheats.signers();
          const tx = await token.connect(stranger).mint(stranger.address, 10n ** 18n, { gasLimit: 1_000_000 });
          await tx.wait();
        } catch (error: any) {
          revertedTxHash = get<any, string>(error, "error.data.txHash") || get<any, string>(error, "receipt.hash");
          if (revertedTxHash === undefined) {
            throw error;
          }
        }
      });

      for (let traceParams of TRACE_OPTIONS) {
        const paramsStringified = JSON.stringify(traceParams);

        it(`Trace successful ERC20 mint tx with options "${paramsStringified}"`, async () => {
          const streamedTrace = await streamDebutTraceTransaction(nodes[i], successTxHash, traceParams);

          const defaultTrace = await debugTraceTransaction(nodes[i], successTxHash, traceParams);

          assert.equal(defaultTrace.gas, streamedTrace.gas);
          assert.equal(defaultTrace.returnValue, streamedTrace.returnValue);
          assert.equal(defaultTrace.error, streamedTrace.error);

          assert.deepEqual(defaultTrace.structLogs, streamedTrace.structLogs);
        });
      }

      for (let traceParams of TRACE_OPTIONS) {
        const paramsStringified = JSON.stringify(traceParams);

        it(`Trace reverted ERC20 mint tx with options "${paramsStringified}"`, async () => {
          const streamedTrace = await streamDebutTraceTransaction(nodes[i], revertedTxHash, traceParams);

          const defaultTrace = await debugTraceTransaction(nodes[i], revertedTxHash, traceParams);

          assert.equal(defaultTrace.gas, streamedTrace.gas);
          assert.equal(defaultTrace.returnValue, streamedTrace.returnValue);
          assert.equal(defaultTrace.error, streamedTrace.error);

          assert.deepEqual(defaultTrace.structLogs, streamedTrace.structLogs);
        });
      }
    });
  }
});
