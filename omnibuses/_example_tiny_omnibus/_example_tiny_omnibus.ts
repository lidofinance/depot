import { Omnibus } from "../../src/omnibuses";
import { createContracts } from "../../src/contracts";

import { Agent_ABI } from "../../abi/Agent.abi";
import { Finance_ABI } from "../../abi/Finance.abi";
import { MiniMeToken_ABI } from "../../abi/MiniMeToken.abi";

const LDO_TRANSFER_AMOUNT = 10_000n * 10n ** 18n;
const LDO_TRANSFER_RECIPIENT = "0x0000000000000000000000000000000000000777";

const contracts = createContracts({
  agent: [Agent_ABI, "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c"],
  ldo: [MiniMeToken_ABI, "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32"],
  finance: [Finance_ABI, "0xB9E5CBB9CA5b0d659238807E84D0176930753d86"],
});

export default Omnibus.create({
  network: "mainnet",

  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  calls: ({ blueprints }) => [
    blueprints.tokens.transfer(contracts, {
      title: "Transfer 10,000 LDO to test address",
      to: LDO_TRANSFER_RECIPIENT,
      token: contracts.ldo.address,
      amount: LDO_TRANSFER_AMOUNT,
      comment: "Transfer 10,000 LDO to test address",
    }),
  ],

  testVote: async ({ client, checks, passOmnibus }) => {
    const [recipientBalanceBefore, agentBalanceBefore] = await Promise.all([
      client.read(contracts.ldo, "balanceOf", [LDO_TRANSFER_RECIPIENT]),
      client.read(contracts.ldo, "balanceOf", [contracts.agent.address]),
    ]);

    await passOmnibus();

    await checks.tokens.checkERC20Balance({
      token: contracts.ldo.address,
      account: LDO_TRANSFER_RECIPIENT,
      expectedBalance: recipientBalanceBefore + LDO_TRANSFER_AMOUNT,
    });
    await checks.tokens.checkERC20Balance({
      token: contracts.ldo.address,
      account: contracts.agent.address,
      expectedBalance: agentBalanceBefore - LDO_TRANSFER_AMOUNT,
    });
  },
});
