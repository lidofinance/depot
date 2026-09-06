# How to Write an Omnibus

The author supplies a Markdown description. The Solidity vote contract defines the payload; the TypeScript wrapper tests its effects and handles any custom deployment.

## 1. Create the scaffold

```bash
npm run omnibus:create
```

Select the network and enter a date-based name such as `2026_09_06_example`. Mainnet and Hoodi use the same workflow. The command creates:

```text
omnibuses/<name>/
  <name>.md
  Omnibus_<name>.sol
  <name>.ts
```

The Markdown file is a placeholder. The command fills the network, contract name and Voting address; the author provides the substantive description. The Solidity scaffold compiles but rejects an incomplete call list until it is filled.

## 2. Supply the description

Write the vote items inside `<!-- OMNIBUS_DESCRIPTION -->` in `<name>.md`. Specify addresses, amounts, limits, ordering and the required caller. Each numbered item is one call of its parent. Several operations share an Agent forward only when the description groups them into one item.

For each Dual Governance proposal, provide its exact metadata in the matching fenced `### Item N` entry inside `<!-- DG_PROPOSAL_DESCRIPTIONS -->`. The fenced text reaches the payload unchanged. Omit that section for votes without proposals. Resolve missing payload inputs before implementation.

## 3. Implement the Solidity contract

Extend `OmnibusBase` and fill `getOmnibusCalls()` using the builders and libraries in `contracts/libraries/`. Set `VOTE_ITEMS_COUNT` to the actual item count. Use interfaces from `contracts/interfaces/` and `abi.encodeCall` for typed direct calls. Generate a missing interface from the verified ABI with `npm run abi:sync -- <Name> --address <address>`; add `--network-name hoodi` for Hoodi.

Declare every vote address as a local named constant with its literal value visible in the vote file:

```solidity
address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
```

This includes addresses also present in `contracts/addresses/`. Shared lists serve Depot infrastructure; a vote's use of an address does not require adding it there. Use the local constants in the payload. An imported address or a local alias of one does not give the reviewer the required literal value beside the vote.

Copy item titles from the description without their item numbers. Titles must be unique; the runtime adds numbering. Pass explicit metadata to `submitCalls`, stored in a vote-local string constant. Determine the permission model and intended caller before choosing direct execution or forwarding: Lido uses Aragon ACL, while other targets may use OpenZeppelin AccessControl.

See [the one-item vote](../../omnibuses/_example_tiny_omnibus/TinyOmnibus.sol) and [the vote with auxiliary contracts and proposals](../../omnibuses/_example_contract_omnibus/ExampleContractOmnibus.sol).

## 4. Implement the TypeScript tests

Export `Omnibus.create` with `network`, `testVote`, and `testProposal` when the vote submits Dual Governance proposals. Keep `voteId`, `launchedAt`, `executedAt` and `quorumReached` undefined until their real lifecycle milestones.

The wrapper describes checks and deployment. The runner reads vote items and the EVM script from the deployed Solidity contract.

- Read before-state, call `passOmnibus()`, and assert the resulting state or balance deltas. Read expected values from public vote constants where available. Prefer `checks.*` over duplicate state-reading logic.
- Register every item's domain events through `voteEvents.item(title, events)`, using `expectedEvents.*` helpers where available. The runner checks the structural envelopes and rejects unexplained logs.
- For Dual Governance, use `testProposal` and `passProposals()`. Register every proposal call with `proposalEvents[i].call(j, events)` and verify the state after execution. A time-dependent item needs explicit timing in its test.
- Permission changes need the correct ACL or AccessControl checks and, where applicable, a call proving the intended grantee can use the permission.

The runner restores its snapshot after the test, including on failure. Additional snapshots belong only to checks that need their own temporary state.

See [the one-item test](../../omnibuses/_example_tiny_omnibus/_example_tiny_omnibus.ts) and [the proposal tests](../../omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts).

## 5. Deployment configuration

The default path needs exactly one non-test `.sol` file in the omnibus folder, with a contract named after the file and a zero-argument constructor. The runner compiles and deploys it automatically on a local fork. No custom deployment hook is needed.

When constructor arguments or auxiliary contracts require custom deployment, supply `deploy({ deployContract })` and return the vote contract as `omnibus` alongside the other handles. A `deployment` mapping can reference contracts that are already deployed.

## 6. Build and test

```bash
npm run omnibus:build -- <name>
npm run omnibus:test -- <name> --fork-block <block>
npx tsc --noEmit
npm run lint
npm test
```

`omnibus:test` deploys the contract on a local fork, reads and validates its payload, saves `<name>.evm-script.hex`, executes the vote, and runs the state and event checks. Configure `ETH_MAINNET_RPC_URL` or `ETH_HOODI_RPC_URL` for the chosen network. A running local node must already be at the requested block; otherwise the task creates an in-process fork at that block.

Record the network, fork block, results and payload hash. A build alone does not prove execution or event coverage. To inspect execution traces, use `npx hardhat omnibus:trace <name>`.

## 7. Rehearse deployment and launch

```bash
npx hardhat omnibus:deploy <name>
npx hardhat omnibus:launch <name>
```

These commands use a local fork by default. They still ask for a keystore and confirmation, and launch attempts to publish the Markdown description to IPFS when an IPFS provider is configured. Without a provider, launch offers to continue without uploading.

Deployment and launch do not accept `--fork-block`. For a pinned rehearsal, start a local node at the chosen block and keep it running across both commands. Local deployment does not record addresses in the wrapper; launch can deploy the contract itself. To rehearse loading an existing deployment, supply its local `deployment.omnibus` address and keep that same local node alive.

After creation, compare the vote's on-chain script with the contract's `getEVMScript()` and check `isValidVoteScript(voteId)`. The wrapper's saved EVM script must match as well.

## 8. Public deployment and launch

Public transactions require an explicit `--broadcast` on each command. Complete review and fork checks before using them:

```bash
npx hardhat omnibus:deploy <name> --broadcast
npx hardhat omnibus:launch <name> --broadcast
```

For default deployment, successful broadcast records `deployment.omnibus` in the wrapper. Custom deployments require recording their handles explicitly. Launch reads the deployed contract and displays its items and payload before confirmation.

After the real launch, record `voteId` and `launchedAt` (the block number). Set `executedAt` after execution and `quorumReached` when known. Local rehearsals do not establish these public lifecycle facts.
