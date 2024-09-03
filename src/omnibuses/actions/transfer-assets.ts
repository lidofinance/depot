import { call, event } from "../../votes";
import { BigNumberish } from "ethers";
import { Address } from "../../common/types";
import { ERC20 } from "../../../typechain-types";
import { NamedContract } from "../../contracts";
import { LidoEthContracts } from "../../lido";
import { OmnibusAction } from "../omnibus-action";

interface TransferAssetsInput {
  title: string; // The title is required for the assets transfer action
  to: Address;
  token: NamedContract<ERC20>;
  amount: BigNumberish;
}

export const TransferAssets = (contracts: LidoEthContracts<"mainnet">, input: TransferAssetsInput): OmnibusAction => {
  const { finance, agent, callsScript, voting } = contracts;
  const { to, amount, token } = input;

  return {
    title: input.title,
    evmCall: call(finance.newImmediatePayment, [token, to, amount, input.title]),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(finance, "NewPeriod", undefined, { optional: true }),
      event(finance, "NewTransaction", { args: [undefined, false, to, amount, input.title] }),
      event(token, "Transfer", { args: [agent, to, amount] }),
      event(agent, "VaultTransfer", { args: [token, to, amount] }),
    ],
  };
};
