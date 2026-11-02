import { expect } from "chai";
import { HardhatPluginError } from "hardhat/plugins";
import { inspect } from "node:util";
import { BaseError, HttpRequestError } from "viem";

import { toCliError } from "@/src/hardhat/task-errors";

const TOKEN = "s3cr3t-T0KEN";

describe("toCliError", () => {
  it("keeps unexpected errors unexpected and strips the token from everything Hardhat prints", () => {
    const rootCause = new Error(`connect to https://node.example/${TOKEN} refused`);
    const httpError = new HttpRequestError({
      url: `https://mainnet.infura.io/v3/${TOKEN}`,
      body: { method: "eth_chainId" },
      details: `fetch to https://mainnet.infura.io/v3/${TOKEN} failed`,
      cause: new BaseError("middle", { cause: rootCause }),
    });
    expect(inspect(httpError, { depth: 10 })).to.include(TOKEN);

    const cliError = toCliError(httpError);

    expect(HardhatPluginError.isHardhatPluginError(cliError)).to.equal(false);
    // Hardhat prints unexpected errors with console.error, i.e. util.inspect with own fields and the cause chain
    expect(inspect(cliError, { depth: 10 })).to.not.include(TOKEN);
  });
});
