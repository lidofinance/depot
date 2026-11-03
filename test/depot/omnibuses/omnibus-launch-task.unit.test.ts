import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sinon from "sinon";

import prompt from "@/src/common/prompt";
import { getKeystores } from "@/src/hardhat-keystores";
import { NamedKeystore } from "@/src/hardhat-keystores/named-keystore";
import { Omnibus } from "@/src/omnibuses";
import { omnibusTaskBuilders, omnibusTaskDeps } from "@/tasks/omnibuses";

chai.use(chaiAsPromised);
const assert: Chai.AssertStatic = chai.assert;

const LOCAL_RPC_URL = "http://localhost:18546";
const TX_HASH = `0x${"22".repeat(32)}`;

interface RpcRequest {
  id: number;
  method: string;
  params?: [{ from?: string; data?: string }?];
}

// a hardhat dev node: impersonated sends succeed with an empty receipt, any unexpected method fails
function fakeDevNodeFetch(requestedUrls: string[], requests: RpcRequest[]): typeof fetch {
  const results: Record<string, (request: RpcRequest) => unknown> = {
    eth_chainId: () => "0x1",
    web3_clientVersion: () => "HardhatNetwork/3.0.0/@nomicfoundation/edr",
    eth_getTransactionCount: () => "0x0",
    eth_getBalance: () => "0x0",
    eth_blockNumber: () => "0x7",
    hardhat_impersonateAccount: () => true,
    hardhat_stopImpersonatingAccount: () => true,
    // balanceOf answers 1 LDO, so the pilot is not topped up
    eth_call: (request) =>
      request.params?.[0]?.data?.startsWith("0x70a08231") ? `0x${"0".repeat(48)}de0b6b3a7640000` : "0x",
    eth_sendTransaction: () => TX_HASH,
    eth_getTransactionReceipt: (request) => ({
      blockHash: TX_HASH,
      blockNumber: "0x7",
      cumulativeGasUsed: "0x0",
      effectiveGasPrice: "0x0",
      from: requests.find((sent) => sent.method === "eth_sendTransaction")?.params?.[0]?.from,
      gasUsed: "0x0",
      logs: [],
      logsBloom: `0x${"00".repeat(256)}`,
      status: "0x1",
      to: null,
      transactionHash: request.params?.[0],
      transactionIndex: "0x0",
      type: "0x2",
    }),
  };
  return (input: string | URL | Request, init?: RequestInit) => {
    requestedUrls.push(String(input));
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    requests.push(request);
    const result = results[request.method]?.(request);
    const body = result === undefined ? { error: { code: -32000, message: `${request.method} failed` } } : { result };
    return Promise.resolve(Response.json({ jsonrpc: "2.0", id: request.id, ...body }));
  };
}

describe("omnibus:launch dry run", () => {
  let hre: HardhatRuntimeEnvironment;
  let root: string;
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  before(async () => {
    hre = await createHardhatRuntimeEnvironment({ tasks: omnibusTaskBuilders.map((builder) => builder.build()) });
  });

  beforeEach(async () => {
    root = await mkdtemp(path.resolve("omnibuses/_launch_task_"));
    const directory = path.join(root, "fixture");
    await mkdir(directory);
    const module = path.relative(directory, path.resolve("src/omnibuses/omnibus"));
    await writeFile(
      path.join(directory, "fixture.ts"),
      `import { Omnibus } from ${JSON.stringify(module)}; export default Omnibus.create({ network: "mainnet", testVote: async () => {} });`,
    );
    await writeFile(path.join(directory, "fixture.md"), "Launch fixture description");
    process.env = { ...originalEnv, ETH_MAINNET_RPC_URL: "http://localhost:18545", ETH_LOCAL_RPC_PORT: "18546" };
    sinon.stub(console, "log");
    sinon.stub(omnibusTaskDeps, "getOmnibusesDir").returns(root);
    sinon.stub(Omnibus.prototype, "hasDeployMethod").returns(true);
    sinon.stub(Omnibus.prototype, "getDeployment").returns({
      omnibus: Omnibus.deployedContract("0x0000000000000000000000000000000000000001"),
    });
    sinon.stub(Omnibus.prototype, "loadAndValidateOmnibusContractCalls").resolves();
    sinon.stub(Omnibus.prototype, "validateDgProposalDescriptions");
    sinon.stub(Omnibus.prototype, "getEvmScript").returns("0x00000001");
    sinon.stub(Omnibus.prototype, "format").returns("");
    sinon.stub(Omnibus.prototype, "formatDescription").returns("Vote");
    sinon.stub(prompt, "confirmOrAbort").resolves();
  });

  afterEach(async () => {
    sinon.restore();
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  });

  it("never unlocks the key, sends from the impersonated keystore address and stays local", async () => {
    const pilot = await NamedKeystore.fromPrivateKey(
      "pilot",
      // well-known hardhat test account #0, never holds real funds
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      "fixture-password",
    );
    const requestedUrls: string[] = [];
    const requests: RpcRequest[] = [];
    globalThis.fetch = fakeDevNodeFetch(requestedUrls, requests);
    const unlock = sinon.stub(getKeystores(hre), "unlock");
    sinon.stub(getKeystores(hre), "select").resolves(pilot);
    const upload = sinon.stub(omnibusTaskDeps, "uploadDescription");

    // the fake receipt has no logs, so the run ends right after the vote transaction is sent
    await assert.isRejected(hre.tasks.getTask("omnibus:launch").run({ name: "fixture" }), "StartVote log not found");

    sinon.assert.notCalled(unlock);
    sinon.assert.notCalled(upload);
    assert.deepEqual(
      requestedUrls.filter((url) => !url.startsWith(LOCAL_RPC_URL)),
      [],
    );
    const methods = requests.map((request) => request.method);
    assert.notInclude(methods, "eth_sendRawTransaction");
    assert.deepEqual<unknown>(requests[methods.indexOf("hardhat_impersonateAccount")]?.params, [pilot.address]);
    const sent = requests.filter((request) => request.method === "eth_sendTransaction");
    assert.lengthOf(sent, 1);
    assert.equal(sent[0].params?.[0]?.from?.toLowerCase(), pilot.address.toLowerCase());
  });
});
