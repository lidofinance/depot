import { createContracts } from "../../src/contracts";
import { Omnibus } from "../../src/omnibuses";

const contracts = createContracts({
  // Declare required contracts here, for example:
  // easyTrack: [EasyTrack_ABI, "0x..."]
});

export default Omnibus.create({
  network: "mainnet",

  voteId: undefined, // Vote ID should be set only if omnibus is already started.
  launchedAt: undefined, // Launch block number should be set only if omnibus was successfully launched.
  executedAt: undefined, // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: undefined, // Should be set to true if quorum was reached during the vote.

  calls: ({ blueprints, directCall, submitCalls, forwardCalls, forwardCall, event }) => [
    // Put omnibus calls here
  ],

  testVote: async ({ passOmnibus, client, checks }) => {
    const { submittedProposalIds } = await passOmnibus();
  },

  // Remove this check, if the omnibus vote doesn't submit any proposals
  testProposal: async ({ passProposals, client, checks }) => {
    await passProposals();
  },
});
