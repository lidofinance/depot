import { assert } from "chai";
import { Address } from "viem";
import { createDevRpcClient } from "../../src/network/network";
import { lifecycleDeps } from "../../src/aragon-votes-tools/lifecycle";
import { testingDeps, setupLdoHolder, passAragonVote, adoptAragonVoting } from "../../src/aragon-votes-tools/testing";
import { CREATOR, LDO_WHALES_BY_NETWORK_NAME } from "../../src/aragon-votes-tools/constants";
import { HexStrPrefixed } from "../../src/common/bytes";
import { deployMockGovernance, MockGovernanceContracts } from "../helpers/deploy-mock-governance";
import { DevRpcClient } from "../../src/network/dev-rpc-client";
import { GovernanceContracts } from "../../src/omnibuses/governance-contracts";

const RPC_URL = process.env.TEST_RPC_URL ?? "http://localhost:8545";
const MOCK_ERC20_MINT_SELECTOR = "0x40c10f19"; // mint(address,uint256)

describe("aragon vote testing tools (integration)", function () {
  let client: DevRpcClient;
  let mocks: MockGovernanceContracts;
  let deployer: Address;
  let snapshotId: HexStrPrefixed;
  let originalLifecycleDeps: typeof lifecycleDeps.getGovernanceContracts;
  let originalTestingDeps: {
    getGovernanceContracts: typeof testingDeps.getGovernanceContracts;
    startAragonVote: typeof testingDeps.startAragonVote;
    getExecuteReceipt: typeof testingDeps.getExecuteReceipt;
  };

  before(async function () {
    client = await createDevRpcClient("mainnet", RPC_URL);
    [deployer] = await client.getAccounts();
    mocks = await deployMockGovernance(client, deployer);

    // Fund whale with LDO so setupLdoHolder can transfer from whale
    const whale = LDO_WHALES_BY_NETWORK_NAME.mainnet;
    await client.setBalance(whale, 10n ** 18n);
    // Mint LDO to whale using MockERC20.mint(address, uint256)
    await client.impersonate(deployer);
    await client.send("eth_sendTransaction", [
      {
        from: deployer,
        to: mocks.ldo.address,
        data: (MOCK_ERC20_MINT_SELECTOR +
          whale.slice(2).padStart(64, "0") +
          (10n ** 24n).toString(16).padStart(64, "0")) as HexStrPrefixed,
      },
    ]);
    await client.mine(1);

    const govContracts = () => mocks as unknown as GovernanceContracts;

    originalLifecycleDeps = lifecycleDeps.getGovernanceContracts;
    lifecycleDeps.getGovernanceContracts = govContracts;

    originalTestingDeps = { ...testingDeps };
    testingDeps.getGovernanceContracts = govContracts;
  });

  after(function () {
    lifecycleDeps.getGovernanceContracts = originalLifecycleDeps;
    Object.assign(testingDeps, originalTestingDeps);
  });

  beforeEach(async function () {
    snapshotId = await client.snapshot();
  });

  afterEach(async function () {
    await client.revert(snapshotId);
  });

  it("setupLdoHolder funds account with LDO from whale", async function () {
    const account = await setupLdoHolder(client);

    assert.equal(account, CREATOR);
    const balance = await client.read(mocks.ldo, "balanceOf", [CREATOR]);
    assert.isTrue(balance > 0n);
  });

  it("passAragonVote votes and executes a vote", async function () {
    const dummyEvmScript = "0x00000001" as HexStrPrefixed;

    // Create a vote first via lifecycle
    const { startAragonVote } = await import("../../src/aragon-votes-tools/lifecycle");
    const { voteId } = await startAragonVote(client, dummyEvmScript, "Vote to pass", { from: deployer });

    const receipt = await passAragonVote(client, voteId);

    assert.isOk(receipt.transactionHash);
    const [open, executed] = await client.read(mocks.voting, "getVote", [voteId]);
    assert.isFalse(open);
    assert.isTrue(executed);
  });

  it("adoptAragonVoting runs full lifecycle: create + pass", async function () {
    const dummyEvmScript = "0x00000001" as HexStrPrefixed;

    const result = await adoptAragonVoting(client, dummyEvmScript, "Adopt test vote");

    assert.isOk(result.voteId >= 0n);
    assert.isOk(result.createVoteReceipt.transactionHash);
    assert.isOk(result.executeVoteReceipt.transactionHash);

    const [open, executed] = await client.read(mocks.voting, "getVote", [result.voteId]);
    assert.isFalse(open);
    assert.isTrue(executed);
  });
});
