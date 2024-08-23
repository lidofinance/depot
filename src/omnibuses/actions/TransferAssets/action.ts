import { call, event, FormattedEvmCall } from "../../../votes";
import { OmnibusAction } from "../../omnibus-action";
import { BigNumberish } from "ethers";
import { Address } from "../../../common/types";
import { ERC20 } from "../../../../typechain-types";
import { NamedContract } from "../../../contracts";
import { OmnibusActionInput } from "../../omnibus-action-meta";

interface TransferAssetsInput extends OmnibusActionInput {
  title: string; // The title is required for the assets transfer action
  to: Address;
  token: NamedContract<ERC20>;
  amount: BigNumberish;
}

class TransferAssetsClass extends OmnibusAction<TransferAssetsInput> {
  getEVMCalls(): FormattedEvmCall[] {
    const { to, amount, token } = this.input;
    return [call(this.contracts.finance.newImmediatePayment, [token, to, amount, this.title])];
  }

  getExpectedEvents() {
    const { finance, agent } = this.contracts;
    const { to, amount, token } = this.input;

    return [
      event(finance, "NewTransaction", { args: [undefined, false, to, amount, this.title] }),
      event(token, "Transfer", { args: [agent, to, amount] }),
    ];
  }

  async getTestContext() {
    return {
      globalValues: {
        ldoRecipient: `"${this.input.to}"`,
        ldoAmount: `${BigInt(this.input.amount) / 10n ** 18n}n * 10n ** 18n`,
      },
      localValues: ["balanceBefore"],
      beforePreps: ["balanceBefore = await contracts.ldo.balanceOf(ldoRecipient);"],
      testSuites: [testSuite],
    };
  }
}

export const TransferAssets = (input: TransferAssetsInput) => new TransferAssetsClass(input);

const testSuite = `
  describe("TransferAssets", () => {
    it(\`\${formatEther(ldoAmount)} LDO was transferred to \${ldoRecipient}\`, async () => {
      const balanceAfter = await contracts.ldo.balanceOf(ldoRecipient);

      assert.equal(balanceAfter - balanceBefore,  ldoAmount);
    });
  });
`;
