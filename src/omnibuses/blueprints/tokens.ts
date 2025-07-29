import { Address } from "abitype";
import { ERC20_ABI } from "../../../abi/ERC20.abi";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { BlueprintCtx } from "../tools/create-omnibus";

interface GenericTransferInput {
  title: string;
  to: Address;
  amount: bigint;
}

interface TransferInput extends GenericTransferInput {
  token: Address;
}

function transfer(ctx: BlueprintCtx, input: TransferInput): OmnibusDirectCall {
  const { agent, finance } = ctx.contracts;
  const { to, amount, title, token } = input;

  return ctx.call(finance, "newImmediatePayment", [token, to, input.amount, title], {
    title: title,
    events: [
      ctx.event(finance, "NewPeriod", [null, null, null], { isOptional: true }),
      ctx.event(finance, "NewTransaction", [null, false, to, amount, input.title]),
      ctx.event({ abi: ERC20_ABI, address: token, label: "" }, "Transfer", [agent.address, to, amount]),
      ctx.event(agent, "VaultTransfer", [token, to, amount]),
    ],
  });
}

function transferLDO(ctx: BlueprintCtx, input: GenericTransferInput): OmnibusDirectCall {
  return transfer(ctx, { ...input, token: ctx.contracts.ldo.address });
}

export default { transfer, transferLDO };
