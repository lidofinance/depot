import omnibuses from "../src/omnibuses/omnibuses";

export default omnibuses.create({
  network: "holesky",
  description: "example tiny omnibus at holesky via depot",
  // launchedOn: 12345678, // Launch block number should be set only if omnibus was successfully launched.
  // voteId: 000, // Vote ID should be set only if omnibus is already started.
  // executedOn: 12345678,  // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: false, // Should be set to true if quorum was reached during the vote.
  items: ({ blueprints }) => [
    blueprints.tokens.transferLDO({
      title: "Transfer 10,000 LDO to Lucky Wallet hhh",
      to: "0x0000000000000000000000000000000000000777", // Random Address
      amount: 10_000n * 10n ** 18n,
    }),
  ],
});
