import { assert } from "chai";

import { lintVoteSources } from "@/src/omnibuses/address-lint";

const ADDRESS = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";

describe("vote address lint", () => {
  it("reports the file and line of a literal nested in a TypeScript call", () => {
    const file = "omnibuses/example/example.ts";
    const diagnostics = lintVoteSources(new Map([[file, `call({\n  target: "${ADDRESS}",\n});`]]), [file]);

    assert.lengthOf(diagnostics, 1);
    assert.equal(diagnostics[0].file, file);
    assert.equal(diagnostics[0].line, 2);
    assert.include(diagnostics[0].message, "named constant");
  });

  it("checks Solidity nested calls and numeric address conversions without flagging declarations or prose", () => {
    const file = "omnibuses/example/Vote.sol";
    const source = `pragma solidity 0.8.26;\ncontract Vote {\naddress constant LDO = ${ADDRESS};\naddress constant ZERO = address(0);\nfunction calls() external {\ncall(LDO, "Transfer to ${ADDRESS}");\ncall(abi.encode(${ADDRESS}));\ncall(address(uint160(1)));\n}\n}`;
    assert.deepEqual(
      lintVoteSources(new Map([[file, source]]), [file]).map(({ line }) => line),
      [7, 8],
    );
  });

  for (const extension of ["ts", "sol"]) {
    it(`rejects imported ${extension} addresses through renamed exports and local aliases`, () => {
      const file = `omnibuses/example/Vote.${extension}`;
      const sources =
        extension === "ts"
          ? new Map([
              ["shared.ts", `export const LDO = "${ADDRESS}";`],
              ["alias.ts", `export { LDO as TOKEN } from "./shared";`],
              [file, `import { TOKEN as SHARED } from "../../alias";\nconst LOCAL = SHARED;\ncall(LOCAL);`],
            ])
          : new Map([
              ["shared.sol", `library Shared { address internal constant LDO = ${ADDRESS}; }`],
              ["alias.sol", `import { Shared as Tokens } from "./shared.sol";`],
              [
                file,
                `import { Tokens as Imported } from "../../alias.sol";\ncontract Vote { address constant LOCAL = Imported.LDO; }`,
              ],
            ]);
      const diagnostics = lintVoteSources(sources, [file]);
      assert.isNotEmpty(diagnostics);
      assert.equal(diagnostics[0].file, file);
      assert.include(diagnostics[0].message, "shared.");
    });
  }

  it("rejects malformed TS and Solidity source with coordinates instead of skipping it", () => {
    for (const extension of ["ts", "sol"]) {
      const file = `omnibuses/example/example.${extension}`;
      const diagnostics = lintVoteSources(new Map([[file, "const = ;"]]), [file]);
      assert.isNotEmpty(diagnostics);
      assert.equal(diagnostics[0].line, 1);
      assert.include(diagnostics[0].message, "Cannot parse");
    }
  });

  it("reports each imported sol address location once", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["contracts/addresses/MainnetAddresses.sol", `library MainnetAddresses { address constant LDO = ${ADDRESS}; }`],
      [
        file,
        `import {MainnetAddresses} from "../../contracts/addresses/MainnetAddresses.sol";\ncontract Vote { address constant X = MainnetAddresses.LDO;\naddress constant Y = MainnetAddresses.LDO; }`,
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [1, 2, 3],
    );
  });
});
