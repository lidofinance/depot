import { Omnibus } from "../../src/omnibuses";

export default Omnibus.create({
  network: "mainnet",

  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ passOmnibus }) => {
    await passOmnibus();
  },
});
