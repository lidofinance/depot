import { call, event, FormattedEvmCall } from "../../votes";
import { OmnibusHookCtx, OmnibusItem } from "../omnibus-item";
import { BigNumberish, formatEther } from "ethers";
import { Address } from "../../common/types";
import { ERC20, ERC20__factory } from "../../../typechain-types";
import { NetworkName } from "../../networks";
import { LidoEthContracts } from "../../lido";
import { RpcProvider } from "../../providers";

interface TransferAssetsInput {
  to: Address;
  token: Address;
  amount: BigNumberish;
}

export class TransferAssets extends OmnibusItem<TransferAssetsInput> {
  private tokenSymbol: string = "";
  private tokenContract: ERC20 | null = null;
  private amountBefore: BigNumberish = 0;

  async init(network: NetworkName, contracts: LidoEthContracts, provider: RpcProvider) {
    await super.init(network, contracts, provider);
    const { token } = this.input;
    this.tokenContract = ERC20__factory.connect(token, provider);
    this.tokenSymbol = await this.tokenContract.symbol();
  }

  get title(): string {
    const { to, amount } = this.input;
    return `Transfer ${formatEther(amount.toString())} ${this.tokenSymbol} from treasury to ${to}`;
  }

  get call(): FormattedEvmCall {
    const { to, amount, token } = this.input;
    return call(this.contracts.finance.newImmediatePayment, [token, to, amount, this.title]);
  }

  get events() {
    const { finance } = this.contracts;
    const { to, amount } = this.input;

    return [event(finance, "NewTransaction", { args: [undefined, false, to, amount, this.title] })];
  }

  async before({ provider }: OmnibusHookCtx): Promise<void> {
    const { to } = this.input;
    this.amountBefore = await this.tokenContract!.balanceOf(to);
  }

  async after({ it, assert }: OmnibusHookCtx): Promise<void> {
    const { amount, to } = this.input;
    const balanceAfter = await this.tokenContract!.balanceOf(to);
    it(`assets was transferred successfully`, async () => {
      const balanceBefore = BigInt(this.amountBefore.toString()) + BigInt(amount.toString());
      assert.equal(balanceBefore, balanceAfter);
    });
  }
}
