import { before, describe, it } from "mocha";
import { BigNumberish, formatEther, JsonRpcProvider } from "ethers";
import { enactOmnibus } from "../src/omnibuses/tools/test";
import networks from "../src/networks";
import lido from "../src/lido";
import { Receipt } from "web3-types";
import omnibus from "./_example_tiny_omnibus";
import checks from "../src/omnibuses/checks";

const { tokens, events } = checks.mainnet;

const url = networks.localRpcUrl("eth");
const provider = new JsonRpcProvider(url);
const contracts = lido.eth[omnibus.network](provider);

// Testing values
const tokenTransfers = [
  {
    recipient: "0x0000000000000000000000000000000000000777",
    amount: 10_000n * 10n ** 18n,
  },
];

describe("Testing _example_tiny_omnibus", () => {
  let enactReceipt: Receipt;
  let snapshotId: string;

  before(async () => {
    snapshotId = await provider.send("evm_snapshot", []);
  });

  after(async () => {
    await provider.send("evm_revert", [snapshotId]);
  });

  describe("Enact omnibus and check network state after voting...", () => {
    let agentLDOBalanceBefore: any;
    let balancesBefore: BigNumberish[];

    before(async () => {
      agentLDOBalanceBefore = await contracts.ldo.balanceOf(contracts.agent.address);
      balancesBefore = await Promise.all(tokenTransfers.map(({ recipient }) => contracts.ldo.balanceOf(recipient)));

      // Start and enact omnibus. Keep receipt to check events later.
      enactReceipt = await enactOmnibus(omnibus, provider);
      console.log("    Omnibus enacted successfully. Running checks...");
    });

    describe("Check that all assets were transferred correctly", () => {
      for (let i = 0; i < tokenTransfers.length; i++) {
        const { recipient, amount } = tokenTransfers[i];
        it(`${formatEther(amount)} LDO were transferred to ${recipient}`, async () => {
          const expectedBalance = BigInt(balancesBefore[i]) + BigInt(amount);

          await tokens.checkLDOBalance(recipient, expectedBalance);
        });
      }

      it("LDO budget was decreased by the total amount of transfers", async () => {
        const totalSum = tokenTransfers.reduce((acc, { amount }) => acc + amount, 0n);

        await tokens.checkLDOBalance(contracts.agent.address, agentLDOBalanceBefore - totalSum);
      });
    });
  });

  describe("Check fired events by action...", () => {
    it("All expected events were fired", () => {
      events.checkOmnibusEvents(omnibus.items, enactReceipt);
    });
  });
});
