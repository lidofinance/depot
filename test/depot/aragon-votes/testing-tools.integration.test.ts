import { assert } from "chai";
import { Address } from "viem";
import { lifecycleDeps } from "@/src/aragon-votes-tools/lifecycle";
import { testingDeps, setupLdoHolder, passAragonVote } from "@/src/aragon-votes-tools/testing";
import { LDO_VOTERS_BY_NETWORK_NAME } from "@/src/aragon-votes-tools/constants";
import { HexStrPrefixed } from "@/src/common/bytes";
import { createInProcessDevRpcClient } from "../helpers/create-dev-client";
import { deployMockGovernance, MockGovernanceContracts } from "../helpers/deploy-mock-governance";
import { DevRpcClient } from "@/src/network/dev-rpc-client";
import { GovernanceContracts } from "@/src/omnibuses/governance-contracts";

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
  };

  before(async function () {
    client = await createInProcessDevRpcClient();
    [deployer] = await client.getAccounts();
    mocks = await deployMockGovernance(client, deployer);

    // Fund whale with LDO so setupLdoHolder can transfer from whale
    const [whale] = LDO_VOTERS_BY_NETWORK_NAME.mainnet;
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

  it("uses additional voters when setupLdoHolder moves the first voter below quorum", async function () {
    const [firstVoter, secondVoter] = LDO_VOTERS_BY_NETWORK_NAME.mainnet;
    const oneLdo = 10n ** 18n;
    const exactQuorum = 50_000n * oneLdo;
    const secondVoterBalance = 60_000n * oneLdo;
    const firstVoterBalance = await client.read(mocks.ldo, "balanceOf", [firstVoter]);

    await client.impersonate(firstVoter, 10n ** 18n);
    try {
      await client.write(mocks.ldo, "transfer", [secondVoter, secondVoterBalance], { from: firstVoter });
      await client.write(mocks.ldo, "transfer", [deployer, firstVoterBalance - exactQuorum - secondVoterBalance], {
        from: firstVoter,
      });
    } finally {
      await client.stopImpersonating(firstVoter);
    }

    const ldoHolderAddress = await setupLdoHolder(client);
    const { voteId, receipt: createVoteReceipt } = await testingDeps.startAragonVote(
      client,
      "0x00000001" as HexStrPrefixed,
      "Vote requiring two voters",
      { from: ldoHolderAddress },
    );
    await passAragonVote(client, voteId);
    const castVotes = await client.viemClient.getContractEvents({
      ...mocks.voting,
      eventName: "CastVote",
      args: { voteId },
      fromBlock: createVoteReceipt.blockNumber,
    });
    const [, , , , , , yea] = await client.read(mocks.voting, "getVote", [voteId]);

    assert.lengthOf(castVotes, 2);
    assert.equal(castVotes[0]?.args.voter, firstVoter);
    assert.equal(castVotes[1]?.args.voter, secondVoter);
    assert.equal(yea, exactQuorum - oneLdo + secondVoterBalance);
  });
});
