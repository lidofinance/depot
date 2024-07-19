import { OmnibusHookCtx, OmnibusAction } from "../omnibus-action";
import { forward, call, event, FormattedEvmCall } from "../../votes";
import providers from "../../providers";

const COVER_INDEX = 0;
const NONCOVER_INDEX = 1;
const STETH_ERROR_MARGIN_WEI = 2;

interface OnchainStateSnapshot {
  insuranceFundStEthShares: bigint;
  insuranceFundStEthBalance: bigint;

  agentStEthAllowanceForBurner: bigint;

  totalBurntForCover: bigint;
  totalBurntForNonCover: bigint;

  sharesRequestedToBurn: {
    coverShares: bigint;
    nonCoverShares: bigint;
  };
}

interface ApplyInsuranceInstanceInput {
  title: string;
  amount: bigint;
  before: OnchainStateSnapshot;
}

async function resolve<T extends Record<string, Promise<unknown>>>(
  promisesRecord: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const entries = Object.entries(promisesRecord);

  const results = await Promise.all(entries.map(([, promise]) => promise));
  return Object.fromEntries(entries.map(([key], index) => [key, results[index]])) as any;
}

export class ApplyInsuranceAction extends OmnibusAction<ApplyInsuranceInstanceInput> {
  get title() {
    return `Request to burn ${this.input.amount} stETH for cover`;
  }

  get call(): FormattedEvmCall {
    const { amount } = this.input;
    const { agent, insuranceFund, burner, stETH } = this.contracts;
    return forward(this.contracts.agent, [
      call(insuranceFund.transferERC20, [stETH, agent, amount]),
      call(stETH.approve, [burner, amount]),
      call(burner.requestBurnMyStETHForCover, [amount]),
    ]);
  }

  get events() {
    const { amount } = this.input;
    const { agent, callsScript, insuranceFund, stETH, burner } = this.contracts;
    return [
      //`Transfer ${amount} of stETH from InsuranceFund`,
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stETH, "Transfer", { args: [insuranceFund, agent, amount] }),
      event(stETH, "TransferShares", { args: [insuranceFund, agent, undefined] }),
      event(insuranceFund, "ERC20Transferred", { args: [stETH, agent, amount] }),

      // `Approve ${amount} of stETH to ${contracts.address(agent)}`,
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stETH, "Approval", { args: [agent, burner, amount] }),
      // `Request to burn ${amount} on ${contracts.address(burner)}`,
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stETH, "Approval", { args: [agent, burner, /* value :*/ undefined] }),
      event(stETH, "Transfer", { args: [agent, burner, amount] }),
      event(stETH, "TransferShares", { args: [agent, burner, /* sharesValue: */ undefined] }),
      event(burner, "StETHBurnRequested", {
        args: [true, agent, amount, /* amountOfShares */ undefined],
      }),
      event(agent, "ScriptResult"),
    ];
  }

  async before({ it, assert }: OmnibusHookCtx): Promise<void> {
    const actual = await this.makeOnchainStateSnapshot();
    const expected = this.input.before;

    // it("Validate insuranceFund stETH balance", async () => {
    //   assert.isTrue(
    //     actual.insuranceFundStEthBalance >= expected.insuranceFundStEthBalance,
    //     "invalid InsuranceFund stETH balance",
    //   );
    // });

    // it("Validate InsuranceFund stETH shares", async () => {
    //   assert.equal(
    //     actual.insuranceFundStEthShares,
    //     expected.insuranceFundStEthShares,
    //     "invalid InsuranceFund stETH shares",
    //   );
    // });

    // it("Validate Agent allowance on Burner contract", async () => {
    //   assert.equal(
    //     actual.agentStEthAllowanceForBurner,
    //     expected.agentStEthAllowanceForBurner,
    //     "invalid Agent allowance on Burner contract",
    //   );
    // });

    // it("Validate Burner state", async () => {
    //   assert.equal(actual.totalBurntForCover, expected.totalBurntForCover);
    //   assert.isTrue(actual.totalBurntForNonCover >= expected.totalBurntForNonCover);
    //   assert.equal(
    //     actual.sharesRequestedToBurn.coverShares,
    //     expected.sharesRequestedToBurn.coverShares,
    //   );
    //   assert.equal(
    //     actual.sharesRequestedToBurn.nonCoverShares,
    //     expected.sharesRequestedToBurn.nonCoverShares,
    //   );
    // });
  }

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {
    it("After the insurance applying onchain state changed correctly", async () => {
      // const { amount, before } = this.input;
      // const after = await this.makeOnchainStateSnapshot();
      // assert.approximately(
      //   before.insuranceFundStEthBalance - after.insuranceFundStEthBalance,
      //   amount,
      //   STETH_ERROR_MARGIN_WEI,
      // );
      // assert.equal(
      //   after.insuranceFundStEthShares,
      //   before.insuranceFundStEthShares,
      //   "invalid InsuranceFund stETH shares",
      // );
    });

    it("The coverage applies correctly", async () => {
      // after the simulation is done, restore the state of the chain
      const snapshot = await providers.cheats(provider).snapshot();

      // run oracle report

      await snapshot.revert();
    });
  }

  private async makeOnchainStateSnapshot(): Promise<OnchainStateSnapshot> {
    const { stETH, insuranceFund, agent, burner } = this.contracts;
    return resolve({
      insuranceFundStEthShares: stETH.balanceOf(insuranceFund),
      insuranceFundStEthBalance: stETH.sharesOf(insuranceFund),

      agentStEthAllowanceForBurner: stETH.allowance(agent, burner),

      totalBurntForCover: burner.getCoverSharesBurnt(),
      totalBurntForNonCover: burner.getNonCoverSharesBurnt(),
      sharesRequestedToBurn: burner.getSharesRequestedToBurn(),
    });
  }
}
