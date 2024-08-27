import { BigNumberish } from "ethers";
import { Contracts } from "../../contracts/contracts";
import LidoOnMainnet from "../../../configs/lido-on-mainnet";
import { assert } from "../../common/assert";

export const checkLDOBalance =
  (contracts: Contracts<typeof LidoOnMainnet>) => async (address: string, balance: BigNumberish) => {
    const ldoBalance = await contracts.ldo.balanceOf(address);

    assert.equal(ldoBalance, balance);
  };
