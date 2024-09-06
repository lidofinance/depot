import { BigNumberish } from "ethers";
import { assert } from "../../common/assert";
import { CheckContext } from "./checks";

const checkLDOBalance = async ({ contracts }: CheckContext, address: string, balance: BigNumberish) => {
  const ldoBalance = await contracts.ldo.balanceOf(address);

  assert.equal(ldoBalance, balance);
};

export default {
  checkLDOBalance,
};
