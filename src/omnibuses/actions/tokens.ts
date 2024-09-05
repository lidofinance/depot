import { Address } from "web3-types";
import { NetworkName } from "../../networks";
import { OmnibusAction } from "../omnibus-action";
import { NamedContract } from "../../contracts";
import { ERC20 } from "../../../typechain-types";
import { BigNumberish } from "ethers";
import { call, event } from "../../votes";
import lido from "../../lido";
import { ERC20__factory } from "../../../typechain-types/factories/interfaces";

interface GenericTransferInput {
  title: string;
  to: Address;
  amount: BigNumberish;
}

interface TransferInput extends GenericTransferInput {
  token: Address | NamedContract<ERC20>;
}

function transfer(network: NetworkName, input: TransferInput): OmnibusAction {
  const { agent, finance } = lido.eth[network]();
  const { to, amount, title } = input;
  const token = typeof input.token === "string" ? ERC20__factory.connect(input.token) : input.token;

  return {
    title: title,
    evmCall: call(finance.newImmediatePayment, [token, to, input.amount, title]),
    expectedEvents: [
      event(finance, "NewTransaction", { args: [undefined, false, to, amount, title] }),
      event(token, "Transfer", { args: [agent, to, amount] }),
    ],
  };
}

function transferLDO(network: NetworkName, input: GenericTransferInput): OmnibusAction {
  return transfer(network, { ...input, token: lido.eth[network]().ldo });
}

export default { transfer, transferLDO };
