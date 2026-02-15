import { Address } from "abitype";
import { formatEther } from "viem";

import { CheckContext } from "./checks";
import { assert } from "../../common/assert";
import { contract } from "../../contracts";
import { ERC20_ABI } from "../../../abi/ERC20.abi";

interface CheckERC20BalanceInput {
  token: Address;
  account: Address;
  expectedBalance: bigint;
  epsilon?: number;
}

const checkERC20Balance = async ({ client }: CheckContext, input: CheckERC20BalanceInput) => {
  const token = contract(ERC20_ABI, input.token);
  const { account, expectedBalance, epsilon } = input;

  const actualBalance = await client.read(token, "balanceOf", [account]);

  assert.approximately(
    actualBalance,
    expectedBalance,
    epsilon ?? 0,
    `The balance of token ${token.address} of the account ${account} differ. expected = ${expectedBalance}, actual = ${actualBalance}. delta ${expectedBalance - actualBalance} > ${epsilon}`,
  );
};

export default {
  checkERC20Balance,
};
