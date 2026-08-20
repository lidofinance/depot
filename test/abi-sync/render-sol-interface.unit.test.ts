import { assert } from "chai";
import { Abi } from "abitype";

import { renderSolInterface } from "../../src/abi-sync/render-sol-interface";

const SOURCE = "Etherscan, mainnet 0x0000000000000000000000000000000000000001 (Test)";

/** Prettier wraps long signatures; compare them as one line. */
function flatten(code: string) {
  return code.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
}

const STAKING_ROUTER_LIKE_ABI: Abi = [
  {
    type: "function",
    name: "getStakingModule",
    stateMutability: "view",
    inputs: [{ name: "_stakingModuleId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "tuple", internalType: "struct StakingRouter.StakingModule", components: [] }],
  },
  {
    type: "function",
    name: "updateStakingModule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_stakingModuleId", type: "uint256", internalType: "uint256" },
      { name: "_stakeShareLimit", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [
      { name: "_depositsCount", type: "uint256", internalType: "uint256" },
      { name: "_depositCalldata", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addStakingModule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_name", type: "string", internalType: "string" },
      { name: "_stakingModuleAddress", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "moduleId", type: "uint24", internalType: "uint24" }],
  },
  { type: "event", name: "StakingModuleAdded", inputs: [], anonymous: false },
];

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
  it("declares only state-changing functions with calldata/memory locations", async () => {
    const rendered = await renderSolInterface("IStakingRouter", STAKING_ROUTER_LIKE_ABI, { source: SOURCE });
    const code = flatten(rendered);

    assert.include(code, "pragma solidity 0.8.26;");
    assert.include(code, "interface IStakingRouter {");
    assert.include(code, `function updateStakingModule(uint256 _stakingModuleId, uint256 _stakeShareLimit) external;`);
    assert.include(code, `function deposit(uint256 _depositsCount, bytes calldata _depositCalldata) external payable;`);
    assert.include(
      code,
      `function addStakingModule(string calldata _name, address _stakingModuleAddress) external returns (uint24 moduleId);`,
    );
    assert.notInclude(code, "getStakingModule", "view methods stay out of the interface");
    assert.notInclude(code, "StakingModuleAdded", "events stay out of the interface");
    assert.include(code, `/// @dev Source: ${SOURCE}`);
  });

  it("restricts the interface to requested methods", async () => {
    const code = await renderSolInterface("IStakingRouter", STAKING_ROUTER_LIKE_ABI, {
      source: SOURCE,
      methods: ["deposit"],
    });

    assert.include(code, "function deposit(");
    assert.notInclude(code, "updateStakingModule");
    assert.notInclude(code, "addStakingModule");
  });

  it("fails on a requested method that is not state-changing or does not exist", async () => {
    await assert.isRejected(
      renderSolInterface("IStakingRouter", STAKING_ROUTER_LIKE_ABI, {
        source: SOURCE,
        methods: ["getStakingModule", "nope"],
      }),
      /Methods not found among state-changing functions of the ABI: getStakingModule, nope/,
    );
  });

  it("renders tuples as structs, nested structs first, enums as their storage type", async () => {
    const code = flatten(await renderSolInterface("IDualGovernance", NESTED_STRUCT_ABI, { source: SOURCE }));

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

  it("fails when two different structs share a name", async () => {
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

    await assert.isRejected(renderSolInterface("IFoo", abi, { source: SOURCE }), /Two different structs named "Item"/);
  });
});
