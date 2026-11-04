import { assert } from "chai";
import { Abi } from "abitype";

import { renderSolInterface } from "@/src/abi-sync/render-sol-interface";

const SOURCE = "Etherscan, mainnet 0x0000000000000000000000000000000000000001 (Test)";

/** Prettier wraps long signatures; compare them as one line. */
function flatten(code: string) {
  return code.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
}

const NESTED_STRUCT_ABI: Abi = [
  {
    type: "function",
    name: "submitProposal",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        internalType: "struct ExternalCall[]",
        components: [
          { name: "target", type: "address", internalType: "address" },
          { name: "value", type: "uint96", internalType: "uint96" },
          { name: "payload", type: "bytes", internalType: "bytes" },
        ],
      },
      {
        name: "metadata",
        type: "tuple",
        internalType: "struct Proposals.Metadata",
        components: [
          { name: "title", type: "string", internalType: "string" },
          {
            name: "firstCall",
            type: "tuple",
            internalType: "struct ExternalCall",
            components: [
              { name: "target", type: "address", internalType: "address" },
              { name: "value", type: "uint96", internalType: "uint96" },
              { name: "payload", type: "bytes", internalType: "bytes" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "proposalId", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "function",
    name: "setState",
    stateMutability: "nonpayable",
    inputs: [{ name: "_state", type: "uint8", internalType: "enum DualGovernance.State" }],
    outputs: [],
  },
];

describe("renderSolInterface", () => {
  it("renders tuples as structs, nested structs first, enums as their storage type", () => {
    const code = flatten(renderSolInterface("IDualGovernance", NESTED_STRUCT_ABI, { source: SOURCE }));

    const externalCallIndex = code.indexOf("struct ExternalCall {");
    const metadataIndex = code.indexOf("struct Metadata {");
    assert.isAbove(externalCallIndex, -1);
    assert.isAbove(metadataIndex, externalCallIndex, "a struct is declared before the struct that uses it");
    assert.equal(code.match(/struct ExternalCall \{/g)?.length, 1, "a struct used twice is declared once");

    assert.include(code, "address target;");
    assert.include(code, "ExternalCall firstCall;");
    assert.include(
      code,
      "function submitProposal(ExternalCall[] calldata calls, Metadata calldata metadata) external returns (uint256 proposalId);",
    );
    assert.include(code, "function setState(uint8 _state) external;");
  });

  it("fails when two different structs share a name", () => {
    const abi: Abi = [
      {
        type: "function",
        name: "a",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "x",
            type: "tuple",
            internalType: "struct Foo.Item",
            components: [{ name: "id", type: "uint256", internalType: "uint256" }],
          },
        ],
        outputs: [],
      },
      {
        type: "function",
        name: "b",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "y",
            type: "tuple",
            internalType: "struct Bar.Item",
            components: [{ name: "owner", type: "address", internalType: "address" }],
          },
        ],
        outputs: [],
      },
    ];

    assert.throws(() => renderSolInterface("IFoo", abi, { source: SOURCE }), /Two different structs named "Item"/);
  });
});
