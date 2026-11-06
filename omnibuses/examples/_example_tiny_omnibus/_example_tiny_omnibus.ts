import { parseAbi } from "viem";

import { expectedEvents as ev, Omnibus } from "@/src/omnibuses";
import { contract } from "@/src/contracts";

import { Agent_ABI } from "@/abi/Agent.abi";
import { Finance_ABI } from "@/abi/Finance.abi";
import { MiniMeToken_ABI } from "@/abi/MiniMeToken.abi";

const LDO = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const AGENT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const FINANCE = "0xB9E5CBB9CA5b0d659238807E84D0176930753d86";

const contracts = {
  agent: contract(Agent_ABI, AGENT, "Agent"),
  ldo: contract(MiniMeToken_ABI, LDO, "LDO"),
  finance: contract(Finance_ABI, FINANCE, "Finance"),
};

const voteConstantsAbi = parseAbi([
  "function PAYMENT_AMOUNT() view returns (uint256)",
  "function RECIPIENT() view returns (address)",
  "function ITEM_TITLE() view returns (string)",
]);

export default Omnibus.create({
  network: "mainnet",
  upgrade: false,

  voteId: undefined,

  testVote: async ({ client, checks, passOmnibus, deployment }) => {
    const voteConstants = contract(voteConstantsAbi, deployment.omnibus.address);
    const [amount, recipient, title] = await Promise.all([
      client.read(voteConstants, "PAYMENT_AMOUNT", []),
      client.read(voteConstants, "RECIPIENT", []),
      client.read(voteConstants, "ITEM_TITLE", []),
    ]);
    const [recipientBalanceBefore, agentBalanceBefore] = await Promise.all([
      client.read(contracts.ldo, "balanceOf", [recipient]),
      client.read(contracts.ldo, "balanceOf", [contracts.agent.address]),
    ]);

    const { voteEvents } = await passOmnibus();
    voteEvents.item(
      title,
      ev.finance.tokenPaid(
        { finance: contracts.finance, vault: contracts.agent, token: contracts.ldo },
        { recipient, amount, reference: title },
      ),
    );

    await checks.tokens.checkERC20Balance({
      token: contracts.ldo.address,
      account: recipient,
      expectedBalance: recipientBalanceBefore + amount,
    });
    await checks.tokens.checkERC20Balance({
      token: contracts.ldo.address,
      account: contracts.agent.address,
      expectedBalance: agentBalanceBefore - amount,
    });
  },
});
