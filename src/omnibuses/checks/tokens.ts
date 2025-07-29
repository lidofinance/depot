import { Address } from "abitype";
import { formatEther } from "viem";

import { CheckContext } from "./checks";
import { assert } from "../../common/assert";

const checkLDOBalance = async (
  { contracts: { ldo }, client }: CheckContext,
  address: Address,
  expectedBalance: bigint,
) => {
  const actualBalance = await client.read(ldo, "balanceOf", [address]);
  assert.equal(
    actualBalance,
    expectedBalance,
    `The values differ is ${formatEther(actualBalance - expectedBalance)} LDO`,
  );
};

export default {
  checkLDOBalance,
};
