import rpcs, { SpawnedRpcNode } from "../rpcs";
import {
  IssuableERC20,
  IssuableERC20__factory,
  TracingSample,
  TracingSample__factory,
} from "../../typechain-types";
import providers, { ProviderCheats, SignerWithAddress } from "../providers";
import { DebugTxTraceStrategy } from "./debug-trace-tx-strategy";
import { assert, Assertion } from "chai";
import eth from "ethers";

interface TestContext {
  node: SpawnedRpcNode;
  token: IssuableERC20;
  cheats: ProviderCheats;
  owner: SignerWithAddress;
}

const RPC_NODES = [
  ["anvil", { port: 8544, stepsTracing: true }],
  ["hardhat", { port: 8545 }],
  ["ganache", { server: { port: 8546 } }],
];

describe("DebugTraceTxStrategy", () => {
  let nodes: SpawnedRpcNode[];
  let node: SpawnedRpcNode;
  let token: IssuableERC20;
  let cheats: ProviderCheats;
  let owner: SignerWithAddress;
  let sample: TracingSample;
  let debugTxStrategy: DebugTxTraceStrategy;
  const contexts: TestContext[] = [];

  before(async () => {
    nodes = await Promise.all(RPC_NODES.map((config) => rpcs.spawn(...(config as [any]))));
    cheats = providers.cheats(node.provider);
    [owner] = await cheats.signers();
    debugTxStrategy = new DebugTxTraceStrategy(node.provider);
    sample = await new TracingSample__factory(owner).deploy();
    token = await new IssuableERC20__factory(owner).deploy(owner.address, "Test Token", "TT");
  });

  after(async () => {
    await node.stop();
  });

  it("ERC20 mint tx", async () => {
    const tx = await token.mint(owner.address, 10n ** 18n);
    const receipt = await tx.wait();

    const trace = await debugTxStrategy.trace(receipt!);
    assert.equal(trace.length, 1);
    assert.equal(trace[0].type, "CALL");
  });

  it("Sample tx", async () => {
    const tx = await sample.testSuccess();
    const receipt = await tx.wait();
    const trace = await debugTxStrategy.trace(receipt!);
  });
});
