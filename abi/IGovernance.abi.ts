export const IGovernance_ABI = [
  {
    type: "function",
    name: "TIMELOCK",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract ITimelock" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canScheduleProposal",
    inputs: [{ name: "proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "cancelAllPendingProposals",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "scheduleProposal",
    inputs: [{ name: "proposalId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitProposal",
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
      { name: "metadata", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "proposalId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "ProposalSubmitted",
    inputs: [
      { name: "proposerAccount", type: "address", indexed: true, internalType: "address" },
      { name: "proposalId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "metadata", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
] as const;
