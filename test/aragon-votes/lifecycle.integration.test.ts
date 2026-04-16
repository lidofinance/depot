import { assert } from "chai";
import { encodeFunctionData, Address } from "viem";
import { createDevRpcClient } from "../../src/network/network";
import { lifecycleDeps, startAragonVote, executeAragonVote, getExecuteReceipt } from "../../src/aragon-votes-tools/lifecycle";
import { EvmScriptParser } from "../../src/aragon-votes-tools/evm-script-parser";
import { HexStrPrefixed } from "../../src/common/bytes";
import { deployMockGovernance, MockGovernanceContracts } from "../helpers/deploy-mock-governance";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { GovernanceContracts } from "../../src/omnibuses/governance-contracts";

const RPC_URL = process.env.TEST_RPC_URL ?? "http://localhost:8545";

describe("aragon vote lifecycle (integration)", function () {
  let client: DevRpcClient;
  let mocks: MockGovernanceContracts;
  let deployer: Address;
  let snapshotId: HexStrPrefixed;
  let originalDeps: typeof lifecycleDeps.getGovernanceContracts;

  before(async function () {
    client = await createDevRpcClient("mainnet", RPC_URL);
    [deployer] = await client.getAccounts();
    mocks = await deployMockGovernance(client, deployer);

    originalDeps = lifecycleDeps.getGovernanceContracts;
    lifecycleDeps.getGovernanceContracts = () => mocks as unknown as GovernanceContracts;
  });

  after(function () {
    lifecycleDeps.getGovernanceContracts = originalDeps;
  });

  beforeEach(async function () {
    snapshotId = await client.snapshot();
  });

  afterEach(async function () {
    await client.revert(snapshotId);
  });

  it("startAragonVote creates vote and returns voteId + receipt", async function () {
    const dummyEvmScript = "0x00000001" as HexStrPrefixed;

    const { voteId, receipt } = await startAragonVote(client, dummyEvmScript, "Test vote", { from: deployer });

    assert.equal(voteId, 0n);
    assert.isOk(receipt.transactionHash);

    const [open, executed] = await client.read(mocks.voting, "getVote", [voteId]);
    assert.isTrue(open);
    assert.isFalse(executed);
  });

  it("executeAragonVote executes an open vote", async function () {
    const dummyEvmScript = "0x00000001" as HexStrPrefixed;
    const { voteId } = await startAragonVote(client, dummyEvmScript, "Vote to execute", { from: deployer });

    const receipt = await executeAragonVote(client, voteId, { from: deployer });

    assert.isOk(receipt.transactionHash);
    const [open, executed] = await client.read(mocks.voting, "getVote", [voteId]);
    assert.isFalse(open);
    assert.isTrue(executed);
  });

  it("getExecuteReceipt finds ExecuteVote event receipt", async function () {
    const dummyEvmScript = "0x00000001" as HexStrPrefixed;
    const { voteId } = await startAragonVote(client, dummyEvmScript, "Vote for receipt", { from: deployer });
    const execReceipt = await executeAragonVote(client, voteId, { from: deployer });

    const foundReceipt = await getExecuteReceipt(client, voteId);

    assert.equal(foundReceipt.transactionHash, execReceipt.transactionHash);
  });
});
