import { Omnibus } from "../../src/omnibuses";

const LDO_TRANSFER_AMOUNT = 10_000n * 10n ** 18n;
const LDO_TRANSFER_RECIPIENT = "0x0000000000000000000000000000000000000777";

export default Omnibus.create({
  network: "mainnet",

  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  calls: ({ blueprints }) => [
    blueprints.tokens.transferLDO({
      title: "Transfer 10,000 LDO to test address",
      to: LDO_TRANSFER_RECIPIENT,
      amount: LDO_TRANSFER_AMOUNT,
    }),
  ],

  testVote: async ({ client, checks, contracts, passOmnibus }) => {
    const [recipientBalanceBefore, agentBalanceBefore] = await Promise.all([
      client.read(contracts.ldo, "balanceOf", [LDO_TRANSFER_RECIPIENT]),
      client.read(contracts.ldo, "balanceOf", [contracts.agent.address]),
    ]);

    await passOmnibus();

    await checks.tokens.checkLDOBalance(LDO_TRANSFER_RECIPIENT, recipientBalanceBefore + LDO_TRANSFER_AMOUNT);
    await checks.tokens.checkLDOBalance(contracts.agent.address, agentBalanceBefore - LDO_TRANSFER_AMOUNT);
  },
});
