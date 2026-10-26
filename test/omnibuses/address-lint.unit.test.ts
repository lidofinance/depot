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

  it("respects loop binding scope while retaining imported namespace aliases", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      ["shared.ts", `export const LDO = "${ADDRESS}";`],
      [
        file,
        [
          `import * as shared from "../../shared";`,
          `for (const shared of [{ LDO: 1 }]) void shared.LDO;`,
          `for (let shared = { LDO: 1 }; shared.LDO < 2; shared.LDO++) void shared.LDO;`,
          `void shared.LDO;`,
          `for (let alias = shared; false;) void alias.LDO;`,
        ].join("\n"),
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [4, 5],
    );
  });

  it("limits catch binding shadowing to its catch clause", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      ["shared.ts", `export const LDO = "${ADDRESS}";`],
      [
        file,
        [
          `import * as shared from "../../shared";`,
          `try { throw { LDO: 1 }; } catch (shared) {`,
          `  if (shared && typeof shared === "object" && "LDO" in shared) void shared.LDO;`,
          `}`,
          `void shared.LDO;`,
        ].join("\n"),
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [5],
    );
  });

  it("accepts address literal types while rejecting inline runtime values", () => {
    const file = "omnibuses/example/example.ts";
    const source = [
      `const LDO: "${ADDRESS}" = "${ADDRESS}";`,
      `void LDO;`,
      `void ("${ADDRESS}" as "${ADDRESS}");`,
    ].join("\n");
    assert.deepEqual(
      lintVoteSources(new Map([[file, source]]), [file]).map(({ line }) => line),
      [3],
    );
  });

  it("requires named payable constants and reports nested conversions once", () => {
    const file = "omnibuses/example/Vote.sol";
    const source = [
      `pragma solidity 0.8.26;`,
      `address payable constant ZERO = payable(0);`,
      `contract Vote {`,
      `  address payable constant OTHER = payable(address(0));`,
      `  function run() external pure {`,
      `    payable(0);`,
      `    payable(address(0));`,
      `    address(payable(0));`,
      `  }`,
      `}`,
    ].join("\n");
    assert.deepEqual(
      lintVoteSources(new Map([[file, source]]), [file]).map(({ line, column }) => [line, column]),
      [
        [6, 5],
        [7, 5],
        [8, 5],
      ],
    );
  });

  for (const extension of ["ts", "sol"]) {
    it(`reports each imported ${extension} address location once`, () => {
      const file = `omnibuses/example/Vote.${extension}`;
      const sources =
        extension === "ts"
          ? new Map([
              ["shared.ts", `export const LDO = "${ADDRESS}"; export const TOKENS = { ldo: LDO };`],
              [
                file,
                `import { TOKENS } from "../../shared"; import * as shared from "../../shared";\nvoid shared.TOKENS.ldo;\nvoid shared.TOKENS.ldo;`,
              ],
            ])
          : new Map([
              [
                "contracts/addresses/MainnetAddresses.sol",
                `library MainnetAddresses { address constant LDO = ${ADDRESS}; }`,
              ],
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
  }

  it("accepts explicitly valued contract constants but rejects imported and inline addresses", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", `library Shared { address constant LDO = ${ADDRESS}; }`],
      [
        file,
        `interface IFoo {}\nIFoo constant GLOBAL = IFoo(${ADDRESS});\ncontract Vote { IFoo constant LOCAL = IFoo(address(0)); }`,
      ],
    ]);
    assert.isEmpty(lintVoteSources(sources, [file]));
    sources.set(
      file,
      `import {Shared} from "../../shared.sol"; interface IFoo {} contract Vote { IFoo constant LOCAL = IFoo(Shared.LDO); }`,
    );
    const imported = lintVoteSources(sources, [file]);
    assert.isNotEmpty(imported);
    assert.include(imported[0].message, "imported address from shared.sol");
    sources.set(
      file,
      `interface IFoo {} contract Vote {\nIFoo mutableValue = IFoo(${ADDRESS});\nfunction get() external pure returns(IFoo) { return IFoo(${ADDRESS}); } }`,
    );
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [2, 3],
    );
  });

  it("identifies the imported Solidity file when parsing fails", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", "contract {"],
      [file, `import "../../shared.sol"; contract Vote {}`],
    ]);
    assert.throws(() => lintVoteSources(sources, [file]), /Cannot parse imported source shared\.sol:.*\(1:9\)/);
  });

  it("limits Solidity modifier parameters to their modifier scope", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", `address constant X = ${ADDRESS};`],
      [
        file,
        [
          `import "../../shared.sol"; contract Vote {`,
          `modifier only(uint256 X) { require(X == 1); _; }`,
          `function run() external only(1) {}`,
          `function imported() external pure returns(address) { return X; }`,
          `}`,
        ].join("\n"),
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [4],
    );
  });

  it("resolves Solidity for bindings after their initializer and only within the loop", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", `address constant X = ${ADDRESS};`],
      [
        file,
        [
          `import "../../shared.sol"; contract Vote {`,
          `function run() external pure returns(address) {`,
          `for (uint256 X = 0; X < 2; X++) { require(X < 2); }`,
          `for (address X = X; false;) { require(X == X); }`,
          `return X;`,
          `}}`,
        ].join("\n"),
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [4, 5],
    );
  });

  it("limits abstract contract member shadowing to that contract", () => {
    const file = "omnibuses/example/Vote.sol";
    const sources = new Map([
      ["shared.sol", `address constant X = ${ADDRESS};`],
      [
        file,
        [
          `import "../../shared.sol"; import * as Shared from "../../shared.sol";`,
          `abstract contract Local { uint256 constant X = 1; function get() external pure returns(uint256) { return X; }`,
          `address constant LOCAL = Shared.X;`,
          `}`,
          `contract Imported { function get() external pure returns(address) { return X; } }`,
        ].join("\n"),
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [3, 5],
    );
  });

  it("shares TypeScript lexical bindings across switch cases without leaking outside", () => {
    const file = "omnibuses/example/example.ts";
    const sources = new Map([
      ["shared.ts", `export const LDO = "${ADDRESS}";`],
      [
        file,
        [
          `import * as shared from "../../shared";`,
          `export function get(n: number) { switch (n) {`,
          `case 1: const shared = { LDO: 1 }; return () => shared.LDO;`,
          `default: return () => shared.LDO;`,
          `}}`,
          `void shared.LDO;`,
        ].join("\n"),
      ],
    ]);
    assert.deepEqual(
      lintVoteSources(sources, [file]).map(({ line }) => line),
      [6],
    );
  });
});
