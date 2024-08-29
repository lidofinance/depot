import { call, event, FormattedEvmCall } from "../../votes";
import { OmnibusAction } from "../omnibus-action";
import { BigNumberish } from "ethers";
import { Address } from "../../common/types";
import { ERC20 } from "../../../typechain-types";
import { NamedContract } from "../../contracts";
import { OmnibusActionInput } from "../omnibus-action-meta";

interface TransferAssetsInput extends OmnibusActionInput {
  title: string; // The title is required for the assets transfer action
  to: Address;
  token: NamedContract<ERC20>;
  amount: BigNumberish;
}

export class TransferAssets extends OmnibusAction<TransferAssetsInput> {
  getEVMCalls(): FormattedEvmCall[] {
    const { to, amount, token } = this.input;
    return [call(this.contracts.finance.newImmediatePayment, [token, to, amount, this.title])];
  }

  getExpectedEvents() {
    const { finance, agent, callsScript, voting } = this.contracts;
    const { to, amount, token } = this.input;

    return [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(finance, "NewTransaction", { args: [undefined, false, to, amount, this.title] }),
      event(token, "Transfer", { args: [agent, to, amount] }),
      event(agent, "VaultTransfer", { args: [token, to, amount] }),
    ];
  }
}
