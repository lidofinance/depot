import { Address } from "web3-types";
import { NamedContract } from "../../contracts";
import { ERC20 } from "../../../typechain-types";
import { BigNumberish } from "ethers";
import { call, event } from "../../votes";
import { ERC20__factory } from "../../../typechain-types/factories/interfaces";
import { Contracts } from "../../contracts/contracts";
import { Lido } from "../../../configs/types";
import { OmnibusAction } from "../omnibuses";

interface GenericTransferInput {
  title: string;
  to: Address;
  amount: BigNumberish;
}

interface TransferInput extends GenericTransferInput {
  token: Address | NamedContract<ERC20>;
}

function transfer(contracts: Contracts<Lido>, input: TransferInput): OmnibusAction {
  const { agent, finance, callsScript, voting } = contracts;
  const { to, amount, title } = input;
  const token = typeof input.token === "string" ? ERC20__factory.connect(input.token) : input.token;

  return {
    title: title,
    evmCall: call(finance.newImmediatePayment, [token, to, input.amount, title]),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(finance, "NewPeriod", undefined, { optional: true }),
      event(finance, "NewTransaction", { args: [undefined, false, to, amount, input.title] }),
      event(token, "Transfer", { args: [agent, to, amount] }),
      event(agent, "VaultTransfer", { args: [token, to, amount] }),
    ],
  };
}

function transferLDO(contracts: Contracts<Lido>, input: GenericTransferInput): OmnibusAction {
  return transfer(contracts, { ...input, token: contracts.ldo });
}

export default { transfer, transferLDO };
