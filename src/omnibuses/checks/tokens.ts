import { BigNumberish } from "ethers";
import { Contracts } from "../../contracts/contracts";
import { assert } from "../../common/assert";
import { Lido } from "../../../configs/types";

export const checkLDOBalance = async (contracts: Contracts<Lido>, address: string, balance: BigNumberish) => {
  const ldoBalance = await contracts.ldo.balanceOf(address);

  assert.equal(ldoBalance, balance);
};
