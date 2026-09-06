import { assert } from "chai";

import { lintVoteSources } from "../../src/omnibuses/address-lint";

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

  it("accepts explicit local TypeScript constants, including shared infrastructure values", () => {
    const file = "omnibuses/example/example.ts";
    const source = `const LDO: Address = ("${ADDRESS}" as const);\ncall({target: LDO});\n// ${ADDRESS}\ncall("Transfer to ${ADDRESS}");`;
    assert.isEmpty(lintVoteSources(new Map([[file, source]]), [file]));
  });

  it("requires a separate constant for addresses in collections and mutable declarations", () => {
    const file = "omnibuses/example/example.ts";
    const source = `const recipients = ["${ADDRESS}"];\nlet recipient = "${ADDRESS}";`;
    assert.deepEqual(
      lintVoteSources(new Map([[file, source]]), [file]).map(({ line }) => line),
      [1, 2],
    );
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

  it("rejects namespace imports through export-star cycles and address collections", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      ["shared.ts", `export const LDO = "${ADDRESS}"; export const TOKENS = { ldo: LDO };`],
      ["alias.ts", `export * from "./shared"; export * from "./cycle";`],
      ["cycle.ts", `export * from "./alias";`],
      [file, `import * as shared from "../../alias";\nimport { TOKENS } from "../../shared";\ncall(shared["LDO"]);`],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [2, 3],
    );
  });

  it("allows helper functions whose implementation uses shared addresses and ignores type imports", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      ["shared.ts", `export const LDO = "${ADDRESS}";`],
      ["helper.ts", `import { LDO } from "./shared"; export function helper() { return LDO; }`],
      [file, `import { helper } from "../../helper"; import type { Address } from "viem"; call(helper());`],
    ]);
    assert.isEmpty(lintVoteSources(sources, [file]));
  });

  it("does not make a Solidity helper's internal registry import a vote violation", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      [
        "contracts/addresses/MainnetAddresses.sol",
        `library MainnetAddresses { address internal constant LDO = ${ADDRESS}; }`,
      ],
      [
        "contracts/Helper.sol",
        `import { MainnetAddresses as A } from "./addresses/MainnetAddresses.sol"; library Helper { function run() internal { call(A.LDO); } }`,
      ],
      [
        file,
        `import { Helper } from "../../contracts/Helper.sol"; contract Vote { function calls() external { Helper.run(); } }`,
      ],
    ]);
    assert.isEmpty(lintVoteSources(sources, [file]));
    sources.set(file, `import "../../contracts/addresses/MainnetAddresses.sol"; contract Vote {}`);
    assert.isNotEmpty(lintVoteSources(sources, [file]));
  });

  it("follows aliases within an imported Solidity library", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", `library Shared { address constant LDO = ${ADDRESS}; address constant TOKEN = LDO; }`],
      [
        file,
        `import { Shared } from "../../shared.sol"; contract Vote { function run() external { call(Shared.TOKEN); } }`,
      ],
    ]);
    assert.isNotEmpty(lintVoteSources(sources, [file]));
  });

  it("tracks a namespace alias declared inside a function and respects parameter shadowing", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      ["shared.ts", `export const LDO = "${ADDRESS}";`],
      [
        file,
        `import * as shared from "../../shared";\nfunction f() { const alias = shared; call(alias.LDO); }\nfunction g(shared: { LDO: Address }) { call(shared.LDO); }`,
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [2],
    );
  });

  it("rejects destructured namespace addresses and address exports from excluded ABI files", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      ["shared.abi.ts", `export const LDO = "${ADDRESS}";`],
      [
        file,
        `import * as shared from "../../shared.abi";\nfunction run() { const { LDO: local } = shared; call(local); }`,
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [2],
    );
  });

  it("rejects malformed TS and Solidity source with coordinates instead of skipping it", () => {
    for (const extension of ["ts", "sol"]) {
      const file = `omnibuses/example/example.${extension}`;
      const diagnostics = lintVoteSources(new Map([[file, "const = ;"]]), [file]);
      assert.isNotEmpty(diagnostics);
      assert.equal(diagnostics[0].line, 1);
      assert.include(diagnostics[0].message, "Cannot parse");
    }
  });

  it("rejects bare Solidity address constants imported directly or through a wildcard re-export", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", `address constant LDO = ${ADDRESS};`],
      ["alias.sol", `import {LDO as TOKEN} from "./shared.sol";`],
      [
        file,
        `import "../../shared.sol"; contract Vote { function run() external pure returns(address) { return LDO; } }`,
      ],
    ]);
    assert.isNotEmpty(lintVoteSources(sources, [file]));
    sources.set(
      file,
      `import "../../alias.sol"; contract Vote { function run() external pure returns(address) { return TOKEN; } }`,
    );
    assert.isNotEmpty(lintVoteSources(sources, [file]));
  });

  it("preserves address provenance through namespace rest aliases and object spread exports", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      [
        "shared.ts",
        `export const LDO = "${ADDRESS}"; const original = { LDO }; export const config = { ...original };`,
      ],
      [file, `import * as shared from "../../shared"; const {...alias} = shared; call(alias.LDO);`],
    ]);
    assert.isNotEmpty(lintVoteSources(sources, [file]));
    sources.set(file, `import {config} from "../../shared"; call(config.LDO);`);
    assert.isNotEmpty(lintVoteSources(sources, [file]));
  });

  it("allows numeric Solidity constants and destructured parameters that shadow an imported namespace", () => {
    const sol = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", "uint256 constant MIN_DELAY = uint256(1 days);"],
      [
        sol,
        `import {MIN_DELAY} from "../../shared.sol"; contract Vote { function run() external pure returns(uint256) { return MIN_DELAY; } }`,
      ],
      ["shared.ts", `export const LDO = "${ADDRESS}";`],
      [
        "omnibuses/example/example.ts",
        `import * as shared from "../../shared"; function helper({shared}: {shared:{LDO:number}}) {return shared.LDO;}`,
      ],
    ]);
    assert.isEmpty(lintVoteSources(sources, [sol, "omnibuses/example/example.ts"]));
  });
});
