import contracts from "../../contracts";
import {
  OmnibusAction,
  OmnibusBeforeContext,
  OmnibusTestContext,
  TitledEventChecks,
  TitledEvmCall,
} from "../omnibus";
import { forward, call, event } from "../../votes";

const COVER_INDEX = 0;
const NONCOVER_INDEX = 1;

interface ApplyInsuranceInstanceInput {
  amount: bigint;
}

export class ApplyInsuranceAction extends OmnibusAction<ApplyInsuranceInstanceInput> {
  calls(): TitledEvmCall[] {
    const { amount } = this.input;
    const { agent, insuranceFund, burner, stETH } = this.contracts;
    return [
      [
        `Request to burn ${amount} stETH for cover`,
        forward(this.contracts.agent, [
          call(insuranceFund.transferERC20, [stETH, agent, amount]),
          call(stETH.approve, [burner, amount]),
          call(burner.requestBurnMyStETHForCover, [amount]),
        ]),
      ],
    ];
  }

  events(): TitledEventChecks[] {
    const { amount } = this.input;
    const { agent, callsScript, insuranceFund, stETH, burner } = this.contracts;
    return [
      [
        `Transfer ${amount} of stETH from InsuranceFund`,
        event(callsScript, "LogScriptCall", { emitter: agent }),
        event(stETH, "Transfer", { args: [insuranceFund, agent, amount] }),
        event(stETH, "TransferShares", { args: [insuranceFund, agent, undefined] }),
        event(insuranceFund, "ERC20Transferred", { args: [stETH, agent, amount] }),
      ],

      [
        `Approve ${amount} of stETH to ${contracts.address(agent)}`,
        event(callsScript, "LogScriptCall", { emitter: agent }),
        event(stETH, "Approval", { args: [agent, burner, amount] }),
      ],
      [
        `Request to burn ${amount} on ${contracts.address(burner)}`,
        event(callsScript, "LogScriptCall", { emitter: agent }),
        event(stETH, "Approval", { args: [agent, burner, /* value :*/ undefined] }),
        event(stETH, "Transfer", { args: [agent, burner, amount] }),
        event(stETH, "TransferShares", { args: [agent, burner, /* sharesValue: */ undefined] }),
        event(burner, "StETHBurnRequested", {
          args: [true, agent, amount, /* amountOfShares */ undefined],
        }),
      ],

      [`Forward script result`, event(agent, "ScriptResult")],
    ];
  }
  async before(ctx: OmnibusBeforeContext): Promise<void> {
    // throw new Error("Method not implemented.");
  }
  async test(ctx: OmnibusTestContext): Promise<void> {
    // throw new Error("Method not implemented.");
  }
}

// export default function ApplyInsurance<N extends NetworkName>(
//   {
//     call,
//     forward,
//     event,
//     contracts: { agent, burner, callsScript, stETH, insuranceFund },
//   }: OmnibusActionsContext<N>,
//   amount: bigint,
// ) {
//   return OmnibusAction({
//     name: `ApplyInsurance(amount=${amount})`,

//     calls: [
//       `Request to burn ${amount} stETH for cover`,
//       forward(agent, [
//         call(insuranceFund.transferERC20, [stETH, agent, amount]),
//         call(stETH.approve, [burner, amount]),
//         call(burner.requestBurnMyStETHForCover, [amount]),
//       ]),
//     ],

//     events: [
//       "insuranceFund.transferERC20()",
//       event(callsScript, "LogScriptCall", { emitter: agent }),
//       event(stETH, "Transfer", { args: [insuranceFund, agent, amount] }),
//       event(stETH, "TransferShares", { args: [insuranceFund, agent, undefined] }),
//       event(insuranceFund, "ERC20Transferred", { args: [stETH, agent, amount] }),

//       "stETH.approve()",
//       event(callsScript, "LogScriptCall", { emitter: agent }),
//       event(stETH, "Approval", { args: [agent, burner, amount] }),

//       "burner.requestBurnMyStETHForCover()",
//       event(callsScript, "LogScriptCall", { emitter: agent }),
//       event(stETH, "Approval", { args: [agent, burner, /* value :*/ undefined] }),
//       event(stETH, "Transfer", { args: [agent, burner, amount] }),
//       event(stETH, "TransferShares", { args: [agent, burner, /* sharesValue: */ undefined] }),
//       event(burner, "StETHBurnRequested", {
//         args: [true, agent, amount, /* amountOfShares */ undefined],
//       }),

//       "agent.forward()",
//       event(agent, "ScriptResult"),
//     ],

//     tests: async ({ it, assert }) => {
//       // test(`stETH balance of Insurance fund decreased (approximately) on ${amount}`, () => {
//       //   assert.approximately(
//       //     snapshots.after.insuranceFundBalance,
//       //     snapshots.before.insuranceFundBalance - amount,
//       //     2,
//       //   );
//       // });
//       // test("Shares requested to burn increased correctly", () => {
//       //   assert.equal(
//       //     snapshots.after.sharesRequestedToBurn[COVER_INDEX] -
//       //       snapshots.before.sharesRequestedToBurn[COVER_INDEX],
//       //     snapshots.before.insuranceFundShares - snapshots.after.insuranceFundShares,
//       //   );
//       // });
//       // test("Non cover shares to burn stayed the same", () => {
//       //   assert.equal(
//       //     snapshots.before.sharesRequestedToBurn[NONCOVER_INDEX],
//       //     snapshots.after.sharesRequestedToBurn[NONCOVER_INDEX],
//       //   );
//       // });
//       // test("stETH allowance is zero", () => {
//       //   assert.equal(snapshots.after.burnerAllowance, 0n);
//       // });
//     },
//   });
// }
