import { Omnibus } from "../src/omnibuses";

const LDO_TRANSFER_AMOUNT = 10_000n * 10n ** 18n;
const LDO_TRANSFER_RECIPIENT = "0x0000000000000000000000000000000000000777";

export default Omnibus.create({
  network: "holesky",
  description: "example tiny omnibus at holesky via depot",
  // launchedOn: 12345678, // Launch block number should be set only if omnibus was successfully launched.
  // voteId: 000, // Vote ID should be set only if omnibus is already started.
  // executedOn: 12345678,  // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: false, // Should be set to true if quorum was reached during the vote.
  calls: ({ blueprints }) => [
    blueprints.tokens.transferLDO({
      title: "Transfer 10,000 LDO to Lucky Wallet hhh",
      to: LDO_TRANSFER_RECIPIENT, // Random Address
      amount: LDO_TRANSFER_AMOUNT,
    }),
  ],
  test: async ({ client, checks, contracts, passOmnibus }) => {
    const [recipientBalanceBefore, agentBalanceBefore] = await Promise.all([
      client.read(contracts.ldo, "balanceOf", [LDO_TRANSFER_RECIPIENT]),
      client.read(contracts.ldo, "balanceOf", [contracts.agent.address]),
    ]);

    await passOmnibus();

    checks.tokens.checkLDOBalance(LDO_TRANSFER_RECIPIENT, recipientBalanceBefore + LDO_TRANSFER_AMOUNT);
    checks.tokens.checkLDOBalance(contracts.agent.address, agentBalanceBefore - LDO_TRANSFER_AMOUNT);
  },
});
