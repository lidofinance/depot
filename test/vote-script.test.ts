import lido from "../src/lido";
import { ContractTransactionReceipt, JsonRpcProvider, id, parseEther } from "ethers";

import votes, { evm, call, forward, event } from "../src/votes";
import providers from "../src/providers";
import networks from "../src/networks";

const { agent, burner, insuranceFund, stETH, callsScript } = lido.eth.mainnet();

const INSURANCE_STETH_AMOUNT = parseEther("13.45978634");
const REQUEST_BURN_MY_STETH_ROLE = id("REQUEST_BURN_MY_STETH_ROLE");

describe("VoteScript tests", async () => {
  const provider = new JsonRpcProvider(networks.rpcUrl("eth", "mainnet"));
  const { snapshot, revert } = providers.cheats(provider);
  let snapshotId: string;
  let enactReceipt: ContractTransactionReceipt;

  // Omnibus script

  const description = "Voting created via vote script";
  const voteScript = evm(
    forward(agent, [call(burner.grantRole, [REQUEST_BURN_MY_STETH_ROLE, agent])]),
    forward(agent, [
      call(insuranceFund.transferERC20, [stETH, agent, INSURANCE_STETH_AMOUNT]),
      call(stETH.approve, [burner, INSURANCE_STETH_AMOUNT]),
      call(burner.requestBurnMyStETHForCover, [INSURANCE_STETH_AMOUNT]),
    ]),
    forward(agent, [call(burner.revokeRole, [REQUEST_BURN_MY_STETH_ROLE, agent])]),
  );

  before(async () => {
    await snapshot().then((s) => (snapshotId = s.snapshotId));
    const { enactReceipt: receipt } = await votes.adopt(provider, voteScript, description);
    enactReceipt = receipt;
  });

  after(async () => {
    await revert(snapshotId);
  });

  it("Validate events chain", async () => {
    emits(enactReceipt, [
      "burner.grantRole",
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(burner, "RoleGranted", { args: [REQUEST_BURN_MY_STETH_ROLE, agent, undefined] }),

      "insuranceFund.transferERC20()",
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stETH, "Transfer", { args: [insuranceFund, agent, INSURANCE_STETH_AMOUNT] }),
      event(stETH, "TransferShares", { args: [insuranceFund, agent, undefined] }),
      event(insuranceFund, "ERC20Transferred", { args: [stETH, agent, INSURANCE_STETH_AMOUNT] }),

      "stETH.approve()",
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stETH, "Approval", { args: [agent, burner, INSURANCE_STETH_AMOUNT] }),

      "burner.requestBurnMyStETHForCover()",
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stETH, "Approval", { args: [agent, burner, /* value :*/ undefined] }),
      event(stETH, "Transfer", { args: [agent, burner, INSURANCE_STETH_AMOUNT] }),
      event(stETH, "TransferShares", { args: [agent, burner, /* sharesValue: */ undefined] }),
      event(burner, "StETHBurnRequested", {
        args: [true, agent, INSURANCE_STETH_AMOUNT, /* amountOfShares */ undefined],
      }),

      "burner.revoke",
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(burner, "RoleRevoked", { args: [REQUEST_BURN_MY_STETH_ROLE, agent, undefined] }),

      "agent.forward()",
      event(agent, "ScriptResult"),
    ]);
  });

  it("Trace via debug_traceTransaction()", async () => {
    const trace = await votes.trace(enactReceipt);
    console.log(trace.format());
  });
});
