// @ts-nocheck
import { expect } from "chai";
import { loadContract } from "lib";
import { MiniMeToken } from "typechain-types";

import { parseDeploymentJson } from "../../lib/protocol/networks";

describe("Fast tests for testing CI integration", () => {
  it("Check LDO amount at address 777", async () => {
    const config = await parseDeploymentJson("mainnet");

    const ldo = await loadContract<MiniMeToken>("MiniMeToken", config.daoTokenAddress);

    const balance = await ldo?.balanceOf("0x0000000000000000000000000000000000000777");

    expect(balance).to.be.equal(10000000000000000000000n);
  });
});
