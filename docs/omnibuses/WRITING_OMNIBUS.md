# How to Write an Omnibus

The author supplies a Markdown description. A Solidity contract defines the calls and EVM script; a TypeScript wrapper handles tests and any custom deployment. Use [the examples catalogue](README.md) to select a starting point.

## 1. Create the scaffold

From the repository root:

```bash
npm run omnibus:create
```

Select `mainnet` or `hoodi`, a date-based name such as `2026_09_10_example`, and answer whether the vote contains a protocol upgrade. The command creates:

```text
omnibuses/ongoing/<network>/<name>/
  <name>.md
  <name>.ipfs.md    # public vote text
  Omnibus_<name>.sol
  <name>.ts
```

It fills the network, the `upgrade` flag, contract name and Voting address. CI applies several ongoing votes of a network in folder-name (date) order, testing each after the ones before it; locally use `--after`. Executed votes move to `archive/<network>/`, and reference patterns live in `examples/`. Commands find a vote by name in any of these folders, and the folder network must match the wrapper's `network`. Complete the Markdown and call list before testing: the empty Solidity scaffold compiles, but its call-count check rejects an incomplete list.

## 2. Describe the payload

Write actions between the two `<!-- OMNIBUS_DESCRIPTION -->` markers. Specify targets, callers, amounts, units, limits and order. Each numbered item is one call of its parent; explicitly group several operations if they must share one Agent forward. Resolve any missing payload-changing inputs before implementation.

### Exact Dual Governance metadata

For every submitting vote item, supply one matching `### Item N` entry between the `<!-- DG_PROPOSAL_DESCRIPTIONS -->` markers. Its fenced text is the `metadata` argument passed to `submitProposal`. Omit the section for a vote without proposals. The [template Markdown](../../omnibuses/_omnibus_template/_omnibus_template.md) shows the shape.

Store this text in a vote-local string constant and pass it explicitly to `submitCalls` or `DualGovernanceCalls.submitProposal`. Do not replace it with metadata generated from call titles. Validation compares the contract's decoded metadata and the Markdown character for character, including for custom deployments.

Fence and heading lines are not content. One content line produces no final newline; an explicit empty content line before the closing fence does. Internal line endings and spaces are preserved: a two-line CRLF block yields `"first\r\nsecond"`, not `"first\nsecond"`. Only the final CR belonging to the closing-fence delimiter is removed. Do not trim, normalize or rewrap metadata.

## 3. Implement the Solidity contract

Extend [OmnibusBase](../../contracts/OmnibusBase.sol), implement `getOmnibusCalls()`, and set `VOTE_ITEMS_COUNT` to the actual vote-item count. Use [CallsBuilder.sol](../../contracts/libraries/CallsBuilder.sol) and the [domain helpers](../../.agents/skills/omnibus-writer-sol/HELPERS.md). Each builder's size is the number of its immediate children, not the number of nested operations.

Use the intended deployment's interfaces from `contracts/interfaces/` with `abi.encodeCall` and interface selectors. Write selectors as `IContract.method.selector`, never as hex literals: a literal is checked by nothing. For a missing or stale ABI/interface, follow [ABI sync](../ABI_SYNC.md); confirm the target version before generation. Its default proxy lookup reads latest state, so historical votes may need an explicitly sourced local ABI. Preserve handwritten interfaces and generation filters; for example, `IKernel` uses `--methods setApp`. Buyback interfaces are `IBuybackAllocator` and `IBuybackExecutor`.

### Addresses and titles

Declare every vote address as a local named constant with its literal value visible in that vote file, including infrastructure addresses and zero addresses. Use those constants in calls and in the TS wrapper when a reading handle needs an address; never inline an address literal in a call. The shared registries serve infrastructure; importing an address or aliasing an imported address in a vote does not satisfy the rule. A historical vote-scoped address is not a reason to overwrite the current registry.

Review enforces this rule; no tool checks vote addresses. A PR that changes a vote is not approved until a reviewer other than the author has:

1. checked that every address in the vote's `.sol` and `.ts` follows the rule above;
2. confirmed every address constant against an official Lido source — [docs.lido.fi deployed contracts](https://docs.lido.fi/deployed-contracts/) ([Hoodi](https://docs.lido.fi/deployed-contracts/hoodi/)) or the owning lidofinance repository's `deployed-*.json` on `develop`; for a historical vote-specific address, the [lidofinance/scripts](https://github.com/lidofinance/scripts) archive — and listed that source next to the address in the [reconciliation table](#7-rehearse-deployment-and-launch).

Build, fork tests and `isValidVoteScript` show that the payload is well-formed and executes, not that each address is the intended contract.

Copy titles from the description without manual item numbering. Vote titles must be nonempty and unique; the runtime numbers them by position. `1.Item` and `2)Item` are rejected, while meaningful decimal starts such as `0.5% fee change` are allowed.

Choose the execution route from the target's authority: Voting, DG executor or Agent. Lido uses Aragon ACL; other targets may use OpenZeppelin AccessControl. Domain helpers encode calls but do not confer permissions.

## 4. Write the TypeScript tests

Export `Omnibus.create({ network, upgrade, testVote, testProposal?, testFinalState? })`. Keep `voteId` undefined: `omnibus:launch --broadcast` records it. There is no TS `calls` builder, blueprint or contract-generation step: the runtime reads calls and script from the deployed Solidity contract and checks their consistency.

- In `testVote`, read before-state, await `passOmnibus()`, register every `voteEvents.item(title, domainEvents)`, and assert resulting state/balance changes. Read expected public constants through a typed contract ABI, as in [the tiny test](../../omnibuses/examples/_example_tiny_omnibus/_example_tiny_omnibus.ts). Prefer bound `checks.*` from the callback context where they fit.
- A submitting item still needs `voteEvents.item(title)` when it has no additional domain events. The helper supplies its Voting/DG envelope; this does not check proposal execution.
- In `testProposal`, await `passProposals()` and register each `proposalEvents[i].call(j, domainEvents)`. For multiple Agent-forwarded calls, supply one array per nested call, including empty groups. See [Agent event grouping](../../.agents/skills/omnibus-writer-sol/HELPERS.md#agent-and-dual-governance).
- All submitted proposal IDs must be processed before returning. Optional `passProposals(ids)` supports staged execution and returns results in requested ID order; `[]` does not satisfy completion. Keep state and event assertions for each executed call.
- Verify permissions through the appropriate ACL/OZ checks and a relevant allowed/denied call. Arrange explicit timing for time-window actions, accounting for governance delays.
- In `testFinalState({ client, checks, deployment })`, assert the state the whole vote leaves, without before-state or events (Scripts' "after DG" checks). It runs after the proposals and their events, before acceptance, and is the only per-vote check of an already executed vote.

The core requires execution and complete receipt consumption after both callbacks. It snapshots before `testVote` and restores after `testProposal` and the optional post-execution callback, also on failure. Temporary changes persist between callbacks; add an inner snapshot only when a particular probe requires local rollback.

**`omnibus:test` picks its checks by the on-chain state of `voteId`** at the fork block; wrapper fields do not mark execution.

| On chain                           | What runs                                                                                                                                                                | Not applicable                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| no `voteId`                        | new vote on the fork, `testVote`, all DG, events, `testFinalState`, acceptance, upgrade snapshot                                                                         | —                                                        |
| vote not executed                  | on-chain `getVote(voteId).script` equals the contract's; the same with the real vote, voting only in its main phase                                                      | —                                                        |
| vote executed, DG proposal pending | on-chain `getVote(voteId).script` and `getProposalCalls` equal the contract's; `testProposal` executes the proposal on the fork, DG events, `testFinalState`, acceptance | `testVote`, Aragon events, upgrade snapshot              |
| everything executed                | the same comparison; `testFinalState` and acceptance on the current block                                                                                                | `testVote`, `testProposal`, all events, upgrade snapshot |

The task prints which checks ran and which do not apply. Any `voteId` needs a recorded `deployment.omnibus`: the payload is read from the real contract, never from a local deploy. Execution logs are searched from the vote snapshot block. A fork block before the vote, a rejected vote or a cancelled DG proposal fails the run. A missing `testFinalState` is a warning. A later vote that changes the checked state fails the run; investigate it by hand. CI tests an executed candidate in `ongoing/` the same way, so it stays green while its on-chain state is right. Use `omnibus:trace` to inspect the historical execution.

## 5. Configure deployment

The default deployment needs exactly one non-test `.sol` in the omnibus folder, a contract named after that file and a zero-argument constructor. The runner compiles and deploys it on the local fork automatically.

For constructor arguments or auxiliary contracts, implement `deploy({ deployContract })` and return the vote contract as `omnibus` alongside other handles. A `deployment` mapping supplies already deployed contracts. When `deployment.omnibus` is recorded, test, trace, multi-test and the launch rehearsal compile the local `.sol` on the fork and fail if its EVM script or item titles differ from the recorded contract; omnibuses with their own `deploy()` are not compared. See [the custom-deployment example](../../omnibuses/examples/_example_contract_omnibus/_example_contract_omnibus.ts). Both paths validate the Solidity calls/script and exact DG metadata during preparation.

## 6. Build and test

```bash
npm run fmt:sol
npm run omnibus:build -- <name>
npm run omnibus:test -- <name> --fork-block <block>
npm run types
npm run lint
```

Repository-wide checks that CI runs are in the [verification checklist](../../AGENTS.md#verification-checklist).

Format Solidity with `forge fmt`: the pre-commit hook and CI run `forge fmt --check` on vote contracts. No command checks vote addresses; review does, as described in [Addresses and titles](#addresses-and-titles).

`omnibus:test` prepares the contract, validates its payload, saves `<name>.evm-script.hex`, and then runs the vote/proposal tests. Configure `ETH_MAINNET_RPC_URL` or `ETH_HOODI_RPC_URL` for the chosen network. `--fork-block` and `--after <name,...>` (votes applied first, in order) are available on test and multi-test. A reachable local node must already be at the requested block; a mismatch fails rather than resetting that node. If test cannot connect locally, it creates an in-process fork at the requested block. Without a pin, a new fork starts at latest and a reused node retains its current state. When authoring a vote that has already executed on-chain, pin a block before its execution; otherwise the before-state is the state the vote already produced.

Each acceptance suite keeps its assertions, setup and fixed expectations in one file under `test/protocol/acceptance/`. Register a new suite in `ACCEPTANCE_SUITES` (`tasks/sub-tasks/acceptance.ts`); the runner fails on an unregistered file, and negative suites stay last. The `omnibus:test` task runs Mocha with its prepared client through the post-execution callback of `Omnibus.test()`, after the vote, all DG proposals and event checks, before snapshot restore. A failing suite fails the task. Use `--skip-acceptance` when testing a historical deployment or a network without configured expectations. Direct `Omnibus.test(client)` calls run only the omnibus's own checks unless a callback is supplied. Changes to checked configuration require updating the expectations from an independent deployment source.

Depot tests live under `test/depot/<module>/`: unit tests use `*.unit.test.ts`, and integration tests use `*.integration.test.ts` with in-process Hardhat environments and need no RPC. `npm test` is a shortcut for `test:depot:unit`; `test:all` runs both Depot suites. Per-vote `testVote`/`testProposal` checks stay in `omnibuses/ongoing/<network>/<name>/<name>.ts`. Upgrade snapshot suites live under `test/protocol/snapshot/` and run for every `upgrade: true` vote as described below.

Depot test globs select only `test/depot/`; `omnibus:test` loads the suites listed in `ACCEPTANCE_SUITES`. To run one suite alone against an existing fork, use `TEST_NETWORK=hoodi TEST_RPC_URL=http://localhost:8545 npx mocha --no-config --node-option import=tsx --timeout 600000 test/protocol/acceptance/locator.test.ts` (or `TEST_NETWORK=mainnet`, or another suite file).

Examples depend on the state of their named contracts, operators and permissions. Their recorded historical results do not prove that a fresh latest-state run succeeds. Record skipped tests separately.

Record the chosen network/block, deployed source revision, test results and payload hash. For traces:

```bash
npx hardhat omnibus:trace <name>
```

### Upgrade snapshots

`upgrade: true` in the wrapper is the only switch: `omnibus:test` then runs every suite in `test/protocol/snapshot/` (`lido-snapshot`, `plain-submit`, `dsm`, `node-operators-registry`, `voting`, `first-slots`); `upgrade: false` runs none. The author does not select suites or declare differences. Each suite performs the same actions before and after the vote and compares the results, as in Scripts `tests/snapshot/`. Allowed differences live in the suite next to its comparison as plain code: absolute tolerances (`assertWithinTolerance`), removed or reshaped fields, and scenario rules such as Voting's `votesLength`. When an upgrade intentionally changes a compared value, edit that suite's rule in the same change, from the intended effect and never from an observed diff. Vote-specific effects, such as a new implementation address, are asserted in the wrapper's `testVote`/`testProposal`. `first-slots` reads root slots 0–15 of its 22 targets and arrays of length 1–31 fixed by the reference capture; implementation pointers (EIP-1967 slots, Kernel `apps` entries) lie outside them, so a proxy upgrade passes the suite.

Suites carry mainnet and Hoodi expectations; `tasks/sub-tasks/snapshot.ts` rejects an upgrade on any other network before loading them.

`omnibus:test` first runs the ordinary vote/all DG/event checks with acceptance once on a clean state. Each snapshot case then independently runs this lifecycle on the prepared client without acceptance: source fixture → reference actions/capture inside a reverted snapshot → ordinary vote/all DG/event checks → upgraded actions/capture/comparison inside another reverted snapshot → existing outer restore. Suite module fixtures are scoped to the snapshot run. Preserve source-specific role grants: NOR grants once before both runs, as in Scripts; Lido grants in each run, because Scripts re-grants after the upgrade. EVM revert does not stop impersonation, so use `ImpersonatedAccounts` and stop tracked accounts before reverting. It funds accounts with 10 ETH unless `{ preserveBalance: true }` is passed. Compile required mocks narrowly and clear the artifact cache before reading new artifacts.

`--skip-acceptance` suppresses the clean-pass acceptance only. Direct `Omnibus.test(client, afterExecution, hooks)` supplies the before/comparison hooks but does not load protocol suites; the CLI's `runSnapshots` supplies them. Every case must execute its upgrade; a run with no cases, pending cases, a case that skips the upgrade or a comparison failure fails. Snapshots run only while the Aragon vote is not executed on chain.

Block/time alignment is suite-specific, not global: first-slots/DSM use a preselected target and fail if governance exceeds it; Lido aligns block height; Voting/plain-submit preserve their source observations without asserting gas/ETH/time equality. DSM pins each action's block to the previous timestamp plus one second and keeps the agreed absolute 1 second tolerance (the source accidentally used a relative tolerance of 100%). Lido funding is 100000 ETH (the source double-converted units). Source Lido role regrant still does not prove ACL preservation. When the upgrade starts a new vote (no `voteId`), Voting expects `votesLength` to grow by exactly one in every frame and repeats the launch's LDO funding transfer in its reference run, since the Hoodi funder is one of its voters.

The [upgrade snapshot example](../../omnibuses/examples/_example_upgrade_snapshot/_example_upgrade_snapshot.md) is a local payload that repeats the Locator upgrade call from #204. The live Locator implementation is newer, so on a current fork it deliberately rolls back to the #204 implementation (DSM `0x39BB…` becomes `0xF573…`) to exercise the snapshot suites. Its wrapper sets only `upgrade: true` and asserts the #204 implementation slot in `testProposal`; its command runs all suites. The rejection of a sampled-slot change is covered by the Depot integration test. Suites target current deployments, so run it on a current fork; its command skips the clean-pass acceptance. Full mainnet/Hoodi scenario coverage still requires separately recorded fork runs.

### Cross-repository checks

```bash
npm run omnibus:multi-test -- <name> --repo staking-modules --fork-block <block>
npm run omnibus:multi-test -- <name> --repo stonks --fork-block <block>
```

Targets are `core`, `scripts`, `dual-governance`, `staking-modules` and `stonks`; omitting `--repo` selects all. The optional positional name applies the omnibus and its proposals before the suites; omitting it runs on a bare mainnet fork. The network comes from the vote. Only `core` has a Hoodi suite, as in the upstream CI; on Hoodi the other repositories are skipped with a log line, and the run fails with a `KnownError` before node startup when no selected repository has a suite for the network. Repository suites run serially with a snapshot around each suite, preserving the prepared baseline. Outer cleanup restores the pre-run state and stops a node started by this run; a reused node remains running.

Docker and each target's configured dependencies are required. Repository revisions default to the branch/SHA pins in `src/common/env.ts`, which CI uses too; override them and the image platform through the environment. CI runs the same command per repository (`repo_*_regression.yml`) for each network's ongoing candidate; see [target commands](../../tasks/sub-tasks/containers.ts). A Depot fork test or local model does not substitute for executing these external suites. The staking-modules image pins Foundry v1.5.1 and fails to build when upstream `.foundryref` names another version; bump the pin in `tests@staking-modules.Dockerfile`.

## 7. Rehearse deployment and launch

Before the first run, import an existing key with `npm run ks:add -- <name>` or generate a new account with `npm run ks:gen -- <name>`. Both commands prompt for a password to encrypt the keystore. Deploy and launch always ask to select a keystore account; only `--broadcast` prompts for the password to unlock it.

```bash
npx hardhat omnibus:deploy <name>
npx hardhat omnibus:launch <name>
```

Without `--broadcast` both run only on a hardhat or anvil node at `localhost:$ETH_LOCAL_RPC_PORT` (falling back to the in-process node when nothing listens), send from the selected account by impersonation without unlocking it, and upload nothing to IPFS. With `--broadcast` you type the network name to confirm, `<name>.ipfs.md` is uploaded to IPFS after that, and each transaction hash is printed before sending. After a send error or timeout, check the hash and nonce in an explorer instead of rerunning.

`<name>.ipfs.md` is published verbatim and linked on-chain, so it cannot change after launch; launch, including a rehearsal, refuses a missing, empty or template file. An agent may draft it; the author approves the text before launch.

Before handing over, reconcile the payload with `<name>.md`. The launch rehearsal prints `Omnibus calls` with decoded targets, functions and arguments: map every numbered item of the description to its call and check addresses, amounts and order. Someone other than the contract's author does this (a reviewer or a separate agent without the author's context) and records the item → call table in the PR, with the source of each address ([Addresses and titles](#addresses-and-titles)). Fork tests do not replace it: they check that the calls execute, not that they match the description.

Deploy, launch and trace do not accept `--fork-block`. For a pinned rehearsal, use a local node already at the intended state and keep it alive across commands. Local deployment does not record wrapper addresses; launch can deploy the contract itself. To rehearse reuse, supply `deployment.omnibus` for that same local node.

## 8. Public deployment and lifecycle

After the required review and fork checks, a human performs public deployment and public vote creation with `--broadcast`. Agents never run these commands against Mainnet/Hoodi and never read keystore contents:

```bash
npx hardhat omnibus:deploy <name> --broadcast
npx hardhat omnibus:launch <name> --broadcast
```

Successful default broadcast deployment records `deployment.omnibus` in the wrapper; record custom deployment handles explicitly. Launch reads the deployed contract and displays its items and payload. Broadcast launch records `voteId` in the wrapper; every launch then checks `isValidVoteScript(voteId)` of the contract. Local rehearsals record nothing.

After execution, `omnibus:test <name>` checks the executed vote (see section 4). For a recorded `voteId`, `omnibus:test` and `omnibus:archive` also require the on-chain vote description to equal the one built from `<name>.ipfs.md`; without that file (older votes) the check is skipped with a note. `omnibus:archive <name>` reads the network: it moves the vote when the Aragon vote and all its DG proposals are executed, or when the vote finished without result (rejected, or a DG proposal cancelled, with a warning), and refuses otherwise with the unfinished items. `omnibus:pass-aragon-vote <network> <voteId>` passes a not executed vote on the fork, voting only in its main phase, and refuses an executed one.

If the payload changes after the audit, fork runs fail on the source comparison (section 5): remove `deployment` from the wrapper, redeploy, let the new address show in the PR diff and have that address re-audited. Launch uses only the recorded address.
