# How to Write an Omnibus

The author supplies a Markdown description. A Solidity contract defines the calls and EVM script; a TypeScript wrapper handles tests and any custom deployment. Use [the examples catalogue](README.md) to select a starting point.

## 1. Create the scaffold

From the repository root:

```bash
npm run omnibus:create
```

Select `mainnet` or `hoodi` and a date-based name such as `2026_09_10_example`. The command creates:

```text
omnibuses/<name>/
  <name>.md
  Omnibus_<name>.sol
  <name>.ts
```

It fills the network, contract name and Voting address. Complete the Markdown and call list before testing: the empty Solidity scaffold compiles, but its call-count check rejects an incomplete list.

## 2. Describe the payload

Write actions between the two `<!-- OMNIBUS_DESCRIPTION -->` markers. Specify targets, callers, amounts, units, limits and order. Each numbered item is one call of its parent; explicitly group several operations if they must share one Agent forward. Resolve any missing payload-changing inputs before implementation.

### Exact Dual Governance metadata

For every submitting vote item, supply one matching `### Item N` entry between the `<!-- DG_PROPOSAL_DESCRIPTIONS -->` markers. Its fenced text is the `metadata` argument passed to `submitProposal`. Omit the section for a vote without proposals. The [template Markdown](../../omnibuses/_omnibus_template/_omnibus_template.md) shows the shape.

Store this text in a vote-local string constant and pass it explicitly to `submitCalls` or `DualGovernanceCalls.submitProposal`. Do not replace it with metadata generated from call titles. Validation compares the contract's decoded metadata and the Markdown character for character, including for custom deployments.

Fence and heading lines are not content. One content line produces no final newline; an explicit empty content line before the closing fence does. Internal line endings and spaces are preserved: a two-line CRLF block yields `"first\r\nsecond"`, not `"first\nsecond"`. Only the final CR belonging to the closing-fence delimiter is removed. Do not trim, normalize or rewrap metadata.

## 3. Implement the Solidity contract

Extend [OmnibusBase](../../contracts/OmnibusBase.sol), implement `getOmnibusCalls()`, and set `VOTE_ITEMS_COUNT` to the actual vote-item count. Use [calls-builder.sol](../../contracts/libraries/calls-builder.sol) and the [domain helpers](../../.agents/skills/omnibus-writer-sol/HELPERS.md). Each builder's size is the number of its immediate children, not the number of nested operations.

Use the intended deployment's interfaces from `contracts/interfaces/` with `abi.encodeCall` and interface selectors. Write selectors as `IContract.method.selector`, never as hex literals: a literal is checked by nothing. For a missing or stale ABI/interface, follow [ABI sync](../ABI_SYNC.md); confirm the target version before generation. Its default proxy lookup reads latest state, so historical votes may need an explicitly sourced local ABI. Preserve handwritten interfaces and generation filters; for example, `IKernel` uses `--methods setApp`. Buyback interfaces are `IBuybackAllocator` and `IBuybackExecutor`.

### Addresses and titles

Declare every vote address as a local named constant with its literal value visible in that vote file, including infrastructure addresses and zero addresses. Use those constants in calls and in the TS wrapper when a reading handle needs an address. The shared registries serve infrastructure; importing an address or aliasing an imported address in a vote does not satisfy the rule. A historical vote-scoped address is not a reason to overwrite the current registry.

Copy titles from the description without manual item numbering. Vote titles must be nonempty and unique; the runtime numbers them by position. `1.Item` and `2)Item` are rejected, while meaningful decimal starts such as `0.5% fee change` are allowed.

Choose the execution route from the target's authority: Voting, DG executor or Agent. Lido uses Aragon ACL; other targets may use OpenZeppelin AccessControl. Domain helpers encode calls but do not confer permissions.

## 4. Write the TypeScript tests

Export `Omnibus.create({ network, testVote, testProposal? })`. Keep `voteId`, `launchedAt`, `executedAt` and `quorumReached` undefined until their actual public milestones. There is no TS `calls` builder, blueprint or contract-generation step: the runtime reads calls and script from the deployed Solidity contract and checks their consistency.

- In `testVote`, read before-state, await `passOmnibus()`, register every `voteEvents.item(title, domainEvents)`, and assert resulting state/balance changes. Read expected public constants through a typed contract ABI, as in [the tiny test](../../omnibuses/_example_tiny_omnibus/_example_tiny_omnibus.ts). Prefer bound `checks.*` from the callback context where they fit.
- A submitting item still needs `voteEvents.item(title)` when it has no additional domain events. The helper supplies its Voting/DG envelope; this does not check proposal execution.
- In `testProposal`, await `passProposals()` and register each `proposalEvents[i].call(j, domainEvents)`. For multiple Agent-forwarded calls, supply one array per nested call, including empty groups. See [Agent event grouping](../../.agents/skills/omnibus-writer-sol/HELPERS.md#agent-and-dual-governance).
- All submitted proposal IDs must be processed before returning. Optional `passProposals(ids)` supports staged execution and returns results in requested ID order; `[]` does not satisfy completion. Keep state and event assertions for each executed call.
- Verify permissions through the appropriate ACL/OZ checks and a relevant allowed/denied call. Arrange explicit timing for time-window actions, accounting for governance delays.

The core requires execution and complete receipt consumption after both callbacks. It snapshots before `testVote` and restores after `testProposal`, also on failure. Temporary changes persist between callbacks; add an inner snapshot only when a particular probe requires local rollback.

**Executed votes are not replayed by `omnibus:test`.** Any defined `executedAt`, including zero and regardless of `voteId`, is rejected before the test snapshot. Choosing an earlier fork block does not bypass this guard. Preserve lifecycle facts and use `omnibus:trace` to inspect historical execution.

## 5. Configure deployment

The default deployment needs exactly one non-test `.sol` in the omnibus folder, a contract named after that file and a zero-argument constructor. The runner compiles and deploys it on the local fork automatically.

For constructor arguments or auxiliary contracts, implement `deploy({ deployContract })` and return the vote contract as `omnibus` alongside other handles. A `deployment` mapping supplies already deployed contracts. See [the custom-deployment example](../../omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts). Both paths validate the Solidity calls/script and exact DG metadata during preparation.

## 6. Build and test

```bash
npm run fmt:sol
npm run lint:vote-addresses -- omnibuses/<name>
npm run omnibus:build -- <name>
npm run omnibus:test -- <name> --fork-block <block>
npx tsc --noEmit
npm run lint
npm test
```

Format Solidity with `forge fmt`: the pre-commit hook and CI run `forge fmt --check` on vote contracts. Run address lint from the project root (npm and Husky do this). Build, test and deploy run address-lint guards; launch has no such guard, so use the explicit validation path above before launch. A clean linter result does not prove that an address belongs to the intended deployment.

`omnibus:test` prepares the contract, validates its payload, saves `<name>.evm-script.hex`, and then runs the vote/proposal tests. Configure `ETH_MAINNET_RPC_URL` or `ETH_HOODI_RPC_URL` for the chosen network. `--fork-block` is available on test and multi-test. A reachable local node must already be at the requested block; a mismatch fails rather than resetting that node. If test cannot connect locally, it creates an in-process fork at the requested block. Without a pin, a new fork starts at latest and a reused node retains its current state. When authoring a vote that has already executed on-chain, pin a block before its execution; otherwise the before-state is the state the vote already produced.

Examples depend on the state of their named contracts, operators and permissions. Their recorded historical results do not prove that a fresh latest-state run succeeds. The permissions/node-operators integration suite skips its two fork cases only when `ETH_MAINNET_RPC_URL` is undefined; malformed configured values or connection errors remain failures. Record skipped tests separately.

Record the chosen network/block, deployed source revision, test results and payload hash. For traces:

```bash
npx hardhat omnibus:trace <name>
```

### Cross-repository checks

```bash
npm run omnibus:multi-test -- <name> --repo staking-modules --fork-block <block>
npm run omnibus:multi-test -- <name> --repo stonks --mount-tests --pattern default --fork-block <block>
```

Targets are `core`, `scripts`, `dual-governance`, `staking-modules` and `stonks`; omitting `--repo` selects all. The optional positional name applies the omnibus and its proposals before the suites; omitting it runs on a bare mainnet fork. Repository suites run serially with a snapshot around each suite, preserving the prepared baseline. Outer cleanup restores the pre-run state and stops a node started by this run; a reused node remains running.

Docker and each target's configured dependencies are required. Set the intended branch/SHA and image platform using the existing environment configuration; see [mount examples](../../mount/README.md) and [target commands](../../tasks/sub-tasks/containers.ts). With `--mount-tests`, the selected `mount/<repo>` directories must exist before node startup. `--pattern default` selects the repo-specific mounted example pattern; other patterns use that repo's test runner syntax. A Depot fork test or local model does not substitute for executing these external suites.

## 7. Rehearse deployment and launch

```bash
npx hardhat omnibus:deploy <name>
npx hardhat omnibus:launch <name>
```

Both use a local fork unless `--broadcast` is set. They still unlock a keystore and ask for confirmation. Launch attempts to upload the Markdown to IPFS when a provider is configured; otherwise it offers to continue without upload. Treat publication as an external action even during a local rehearsal.

Deploy, launch and trace do not accept `--fork-block`. For a pinned rehearsal, use a local node already at the intended state and keep it alive across commands. Local deployment does not record wrapper addresses; launch can deploy the contract itself. To rehearse reuse, supply `deployment.omnibus` for that same local node. Run build/address checks before launch because launch does not add an address-lint gate.

## 8. Public deployment and lifecycle

After the required review and fork checks, public deployment and public vote creation each require explicit authorization and `--broadcast`:

```bash
npx hardhat omnibus:deploy <name> --broadcast
npx hardhat omnibus:launch <name> --broadcast
```

Successful default broadcast deployment records `deployment.omnibus` in the wrapper; record custom deployment handles explicitly. Launch reads the deployed contract and displays its items and payload. Compare the saved EVM script and `getEVMScript()` with the created vote, and check `isValidVoteScript(voteId)`.

Record `voteId` and `launchedAt` (block number) after the real launch; `executedAt` after execution; `quorumReached` when known. Local rehearsals establish none of those public facts.
