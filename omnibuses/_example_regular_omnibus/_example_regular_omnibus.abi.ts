import { Contract } from "../../src/contracts";

export const ExampleRegularOmnibusVoteStateValidator_ABI = [
  {
    type: "event",
    name: "StateValidatedBefore",
    inputs: [{ indexed: false, name: "balanceBefore", type: "uint256" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "StateValidatedAfter",
    inputs: [
      { indexed: false, name: "balanceAfter", type: "uint256" },
      { indexed: false, name: "spent", type: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "validateStateBeforeVote",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "validateStateAfterVote",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "beforeValidated",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "afterValidated",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "spent",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export type ExampleRegularOmnibusVoteStateValidatorContract = Contract<
  typeof ExampleRegularOmnibusVoteStateValidator_ABI
>;
