import { Omnibus } from "@/src/omnibuses";

export default Omnibus.create({
  network: "mainnet",
  upgrade: false,

  voteId: undefined,

  testVote: async ({ passOmnibus }) => {
    await passOmnibus();
  },

  // Uncomment and assert the state the vote leaves behind; it is also the only check once the vote is executed
  // testFinalState: async ({ checks }) => {},
});
