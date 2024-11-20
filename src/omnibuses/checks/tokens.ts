import { BigNumberish, formatEther } from "ethers";
import { assert } from "../../common/assert";
import { CheckContext } from "./checks";

const checkLDOBalance = async ({ contracts }: CheckContext, address: string, balance: BigNumberish) => {
  const ldoBalance = await contracts.ldo.balanceOf(address);
  const ldoExpected = BigInt(balance)
  assert.equal(ldoBalance, ldoExpected, `The values differ is ${formatEther(ldoBalance - ldoExpected)} LDO`);
};

export default {
  checkLDOBalance,
};
