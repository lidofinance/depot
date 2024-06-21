import { call, event, FormattedEvmCall } from "../../votes";
import { OmnibusHookCtx, OmnibusItem } from "../omnibus-item";
import { BigNumberish, isAddress } from "ethers";
import { Address } from "../../common/types";
import { ERC20, ERC20__factory } from "../../../typechain-types";
import { NetworkName } from "../../networks";
import { LidoEthContracts } from "../../lido";
import { RpcProvider } from "../../providers";
import { NamedContract } from "../../contracts";
import { OmnibusActionInput } from "../omnibus-item-meta";

interface TransferAssetsInput extends OmnibusActionInput {
  to: Address;
  token: NamedContract<ERC20> | Address;
  amount: BigNumberish;
}

export class TransferAssets extends OmnibusItem<TransferAssetsInput> {
  private tokenContract!: ERC20;
  private amountBefore: BigNumberish = 0;

  async init(network: NetworkName, contracts: LidoEthContracts, provider: RpcProvider) {
    await super.init(network, contracts, provider);
    const { token } = this.input;

    if (isAddress(token)) {
      this.tokenContract = ERC20__factory.connect(token, provider);
    } else {
      this.tokenContract = token;
    }
  }

  get call(): FormattedEvmCall {
    const { to, amount, token } = this.input;
    return call(this.contracts.finance.newImmediatePayment, [token, to, amount, this.title]);
  }

  get events() {
    const { finance, agent } = this.contracts;
    const { to, amount } = this.input;

    return [
      event(finance, "NewTransaction", { args: [undefined, false, to, amount, this.title] }),
      event(this.tokenContract, "Transfer", { args: [agent, to, amount] }),
    ];
  }

  async before(): Promise<void> {
    const { to } = this.input;
    this.amountBefore = await this.tokenContract.balanceOf(to);
  }

  async after({ it, assert }: OmnibusHookCtx): Promise<void> {
    const { amount, to } = this.input;
    const balanceAfter = await this.tokenContract.balanceOf(to);
    it(`assets was transferred successfully`, async () => {
      const balanceBefore = BigInt(this.amountBefore.toString()) + BigInt(amount.toString());
      assert.equal(balanceBefore, balanceAfter);
    });
  }
}
