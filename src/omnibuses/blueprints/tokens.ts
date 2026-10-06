import { Address } from "abitype";
import { ERC20_ABI } from "../../../abi/ERC20.abi";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { BlueprintCtx } from "../omnibus";
import { Finance_ABI } from "../../../abi/Finance.abi";
import { Contract } from "../../contracts";
import { Agent_ABI } from "../../../abi/Agent.abi";

interface Contracts {
  agent: Contract<typeof Agent_ABI>;
  finance: Contract<typeof Finance_ABI>;
}

interface GenericTransferInput {
  title: string;
  to: Address;
  amount: bigint;
  comment: string;
}

interface TransferInput extends GenericTransferInput {
  token: Address;
}

function transfer(ctx: BlueprintCtx, contracts: Contracts, input: TransferInput): OmnibusDirectCall {
  const { agent, finance } = contracts;
  const { to, amount, title, token, comment } = input;

  return ctx.directCall(title, {
    on: finance,
    fn: "newImmediatePayment",
    args: [token, to, input.amount, comment],
    events: [
      ctx.event(finance, "NewPeriod", [null, null, null], { isOptional: true, allowMultiple: true }),
      ctx.event(finance, "NewTransaction", [null, false, to, amount, comment]),
      ctx.event({ abi: ERC20_ABI, address: token, label: "" }, "Transfer", [agent.address, to, amount]),
      ctx.event(agent, "VaultTransfer", [token, to, amount]),
    ],
  });
}

export default { transfer };
