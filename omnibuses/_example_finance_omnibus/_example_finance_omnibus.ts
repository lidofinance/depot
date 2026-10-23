import { assert } from "chai";
import { parseAbi } from "viem";

import { Agent_ABI } from "../../abi/Agent.abi";
import { Finance_ABI } from "../../abi/Finance.abi";
import { Lido_ABI } from "../../abi/Lido.abi";
import { contract, createContracts } from "../../src/contracts";
import { expectedEvents as ev, Omnibus } from "../../src/omnibuses";

const FINANCE = "0xB9E5CBB9CA5b0d659238807E84D0176930753d86";
const AGENT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const SOURCE_VOTE_ID = 200n;

const contracts = createContracts({
  finance: [Finance_ABI, FINANCE],
  vault: [Agent_ABI, AGENT],
  steth: [Lido_ABI, STETH],
});

const voteConstantsAbi = parseAbi([
  "function PAYMENT_AMOUNT() view returns (uint256)",
  "function RECIPIENT() view returns (address)",
  "function PAYMENT_REFERENCE() view returns (string)",
  "function ITEM_TITLE() view returns (string)",
]);

export default Omnibus.create({
  network: "mainnet",
  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ client, checks, passOmnibus, deployment }) => {
    assert.strictEqual(
      await client.read(deployment.omnibus, "isValidVoteScript", [SOURCE_VOTE_ID]),
      true,
      "EVM script differs from mainnet vote #200",
    );

    const voteConstants = contract(voteConstantsAbi, deployment.omnibus.address);
    const [amount, recipient, reference, title] = await Promise.all([
      client.read(voteConstants, "PAYMENT_AMOUNT", []),
      client.read(voteConstants, "RECIPIENT", []),
      client.read(voteConstants, "PAYMENT_REFERENCE", []),
      client.read(voteConstants, "ITEM_TITLE", []),
    ]);
    const { finance, vault, steth } = contracts;
    assert.equal((await client.read(finance, "vault", [])).toLowerCase(), vault.address.toLowerCase());

    const [vaultBalance, recipientBalance, vaultShares, recipientShares, shares] = await Promise.all([
      client.read(steth, "balanceOf", [vault.address]),
      client.read(steth, "balanceOf", [recipient]),
      client.read(steth, "sharesOf", [vault.address]),
      client.read(steth, "sharesOf", [recipient]),
      client.read(steth, "getSharesByPooledEth", [amount]),
    ]);
    assert.isTrue(vaultBalance >= amount, "Aragon Agent has insufficient stETH for the payment");

    const { voteEvents } = await passOmnibus();
    voteEvents.item(title, ev.finance.stethPaid(contracts, { recipient, amount, reference, shares }));

    await Promise.all([
      checks.tokens.checkERC20Balance({
        token: steth.address,
        account: vault.address,
        expectedBalance: vaultBalance - amount,
        epsilon: 2,
      }),
      checks.tokens.checkERC20Balance({
        token: steth.address,
        account: recipient,
        expectedBalance: recipientBalance + amount,
        epsilon: 2,
      }),
    ]);
    assert.equal(await client.read(steth, "sharesOf", [vault.address]), vaultShares - shares);
    assert.equal(await client.read(steth, "sharesOf", [recipient]), recipientShares + shares);
  },
});
