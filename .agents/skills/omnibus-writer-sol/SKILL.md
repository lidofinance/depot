---
name: omnibus-writer-sol
description: Write or update a Lido omnibus from a Markdown vote description as a Solidity contract and a TypeScript fork test. Use when authoring an omnibus or its fork tests.
---

# Omnibus Writer (Solidity-first)

The author of a vote writes Markdown. This skill turns that Markdown into two files: a Solidity
contract that produces the Aragon EVM script, and a TypeScript test that runs the vote on a fork
and checks what it changed. There is no TypeScript description of the calls — the contract is the
only description of what the vote does; the test only verifies that it did it.

Read `docs/omnibuses/WRITING_OMNIBUS.md` for the scaffold, deployment and launch workflow. Mainnet
and Hoodi use the same path. The three-file scaffold lives in `omnibuses/_omnibus_template/`.

The compiler is the point. A wrong method name or argument type fails to build, so anything you
cannot express through a typed interface is a signal to stop, not to improvise.

Do not write a `.t.sol`. Fork tests live in TypeScript, where the vote runner, the event matching
and the state checks already exist — see "The test" below.

## Work in two phases. Never skip phase 1.

### Phase 1 — Inventory

Read the description. Work out what each item does and what it needs. Then **report what is
missing and stop.** Do not write the contract, do not create files, do not guess your way past a
gap.

Phase 1 uses two sources and no others: the description, and this repository. No network, no
Etherscan, no block explorer, no fetching of ABIs. A gap you could close yourself by going out and
looking something up is still a gap — the point of the report is to find out whether the
description and the repository were sufficient, and a lookup hides exactly that.

**The stop is unconditional: if the report has even one entry, you stop and wait for an answer.**
Only a completely empty report lets you continue to phase 2 on your own, and say so explicitly
when you do.

An assumption is not a way past this. "I'll assume X and the tests will tell" is exactly the
failure this phase exists to prevent — a wrong assumption about who calls what produces a contract
that compiles, passes its tests, and hands the DAO the wrong payload. If you are choosing between
two readings, that is an entry in the report, however confident you feel about the choice.

Nor is a list of assumptions at the end of the report. Anything there that would change a call if
answered differently belongs in the report above it as a question. Listing a choice as an
assumption reads as "I decided this" and gets skimmed past; that is the same failure wearing a
label.

Report, grouped, with the vote item each entry belongs to:

- **Contract interfaces you do not have.** Name the contract and its address. An interface exists
  only if it is in `contracts/interfaces/` and declares the exact method needed.
- **Addresses you could not resolve.** Every address must come from the shared infrastructure
  lists (`contracts/addresses/`) or be stated in the description. Anything else is missing — never
  recall an address from memory or look it up elsewhere. An address the description states but
  the registry disagrees with is also a stop: name both addresses and ask which one the vote
  calls. Votes do touch contracts the registry has since replaced, so either answer may be right,
  and only the author knows. During vote authoring, keep `contracts/addresses/` scoped to Depot
  infrastructure. Its addresses are checked against [Lido deployments](https://docs.lido.fi/deployed-contracts/)
  ([Hoodi](https://docs.lido.fi/deployed-contracts/hoodi/)); resolve source conflicts on the corresponding
  network instead of assuming the `scripts` config is current.
- **Role identifiers you could not resolve.** Either the description states the hash, or the
  description states the role name and the contract exposes it as a constant you can read.
- **Ambiguities.** Any item where two readings would produce different calls: unclear ordering,
  unclear whether a call goes through the Aragon Agent, unclear argument values, units, or limits.
- **Missing descriptions.** Every Dual Governance proposal needs its own `### Item N` entry in the
  `<!-- DG_PROPOSAL_DESCRIPTIONS -->` block. A block that is absent, empty, or short of one entry
  per proposal is a gap — ask, and never take the vote item title as a substitute.

Every entry above shares one property: the answer changes the payload. An argument the description
never names is the clearest case — `removeMember(addr, quorum)` needs a quorum, and prose that
says only which member leaves has not given you one. So is a mode passed as a number: "soft mode"
is a name, and the number behind it has to come from the description or from a constant in this
repository, never from your memory of what the enum looked like.

Then stop and wait.

### Before-state is reported, not blocking

Separately from the gaps above, note the items whose **prior** state the description does not pin
down: a proxy upgrade that names the new implementation but not the old one, a rename that gives
the new name only, a reset to zero with no stated starting amount. These do not stop you and do
not belong in the phase 1 report — the author usually cannot supply them, and asking turns every
run into a stall. None of them change the payload, which is why they are not gaps.

List them at the end of the completion report, under "before-state not pinned by the description".
In the test, assert the strongest honest statement about such an item — `before != after`,
presence or absence, a value read from the contract before the vote and compared after — never a
number you were not given.

### Phase 2 — Implementation

Only after the gaps from phase 1 are filled. For a new folder, run `npm run omnibus:create`,
select the network and date-based name, and fill the Markdown placeholder with the author's
description. If the scaffold already exists, update its files. Generate the approved missing
interfaces, implement the Solidity contract, write the TypeScript test, then verify.

## Never invent

Four things are never guessed, never reconstructed from memory, never approximated. If any of
them is unavailable, that is a phase 1 report entry:

1. **An address.**
2. **A method signature** — name, argument types, argument order.
3. **A role identifier.**
4. **A Dual Governance proposal description** — it is an argument of `submitProposal`, so it is
   part of the payload the DAO votes on.

These four share a property: getting them wrong produces a contract that compiles, deploys, reads
correctly, and still does the wrong thing. No later check in the pipeline catches them.

## Where things come from

**Addresses.** Declare every vote address as a local named constant with its literal value
visible at the top of the vote contract:

```solidity
address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
```

Use those local constants in calls. Shared lists in `contracts/addresses/` serve Depot
infrastructure; votes do not import their addresses or alias imported constants. Repeating an
infrastructure address as a vote-local literal constant is allowed. A vote's use of an address
does not require adding it to the shared lists. Address literals belong only in constant
declarations, never inside calls.

**Method signatures.** From the interfaces in `contracts/interfaces/`. A missing interface or
method is a phase 1 report entry and a stop — name the contract, its address, and what you need
to call on it.

Producing the missing interface is phase 2 work, and only for the contracts the answer to your report
approves. Do not write it by hand — generate it from the verified ABI of that exact deployed address:

```bash
npm run abi:sync -- <Name> --address <0x…>
```

The command writes `contracts/interfaces/I<Name>.sol` with every state-changing method of the
deployed contract and refreshes `abi/<Name>.abi.ts` for the TypeScript side. Use `--network-name hoodi`
for Hoodi or `--methods <a,b>` to restrict the Solidity interface. For an unverified contract whose
ABI the answer hands you, use `--from-file <abi.json>`. A proxy is followed to its implementation as
read from the chain; add `--proxy-abi` when the vote calls the proxy's own surface instead. The generated
files go into the same change as the contract, so the reviewer sees the ABI diff next to the vote.

**Selectors.** Always `IContract.method.selector`. Never a hex literal — a literal is checked by
nothing.

**Easy Track permissions.** `EasyTrackPermissionsUtils` in `contracts/libraries/`. Never assemble
the packed bytes by hand.

**Aragon ACL permissions with parameters** (`IACL.grantPermissionP`). `AclPermissionsUtils` in
`contracts/libraries/`: `param(argId, Op.EQ, value)` per node, `ifElse(...)` for trees. Never a
raw `uint256` — a wrong one grants a different permission and nothing catches it. The test must
then assert the stored params with `checks.accessControl.checkAragonPermissionParams(...)` and
expect the events with `expectedEvents.accessControl.permissionGranted(acl, { ..., params })`,
rebuilding the same nodes with `aclParam`/`aclIfElse` from `src/omnibuses`.

## Building the calls

Call kinds available, by nesting level (`contracts/libraries/calls-builder.sol`):

- **vote level** — `directCall`, `submitCalls` (submits a Dual Governance proposal)
- **inside a Dual Governance proposal** — `directCall`, `forwardCall`, `forwardCalls` (act as the
  Aragon Agent), `executeCall` (pass value)
- **inside an Agent forward** — `directCall`

Choosing between them is a permissions question, not a style question: a call goes through the
Agent when the Agent, not Voting, holds the right on the target. If the description does not make
this clear and you cannot establish it from the target contract, it is an ambiguity for phase 1.

**One numbered item is one call of its parent.** Consecutive items that each go through the Agent
are separate `forwardCall`s, not one `forwardCalls` with several nested calls — the description's
numbering is the call list of the proposal, and bundling changes the payload. Use `forwardCalls`
only when a single item explicitly lists several calls under one Agent forward. Do not ask about
this in phase 1; it is settled here.

Use the `submitCalls` overload that takes `metadata` explicitly. The overload without `metadata`
composes one from call titles and must not be used for a new omnibus.

Keep the metadata in a `string internal constant` next to the other vote-scoped constants and pass
that constant to `submitCalls`. Inline at the call site it is unreadable, and a reviewer has to be
able to compare it with the description file at a glance.

The metadata is the text inside the fenced block of the matching `### Item N` entry in
`<!-- DG_PROPOSAL_DESCRIPTIONS -->`, taken character for character: the fence delimiters and the
`### Item N` heading are not part of it, everything between them is, including any line break. It
reaches the payload as written, so it is never rewrapped, retitled, or tidied up. A description
outside a fenced block, or one whose item number matches no submitting vote item, is a phase 1
report entry — see `omnibuses/_omnibus_template/_omnibus_template.md` for the shape.

Vote item titles do not reach the EVM script — they exist for the humans reading the vote. Copy
them from the description rather than rewording.

**A title never carries the number of its item.** The numbers in the description say which item is
which; the vote description is built from the titles and numbers them by position. A number written
into the title would show up twice, and it would also go stale the moment an item is inserted in
the middle — the same way it goes stale for a test addressing a group of logs by title. So
`"2. Transfer 180,000 LDO to the PML multisig"` in the description becomes
`"Transfer 180,000 LDO to the PML multisig"` in the contract. Titles must also be unique within the
vote, for the same reason.

## Layout

```
omnibuses/<name>/
  <name>.md           the description, as written by its author
  Omnibus_<name>.sol  the contract — the only description of the calls
  <name>.ts           the wrapper: network, deployment and tests
```

`omnibus:create` creates all three files and fills the network, contract name and Voting address.
The Markdown is a placeholder; the Solidity scaffold compiles but rejects an incomplete call
list until it is filled.

The default path requires exactly one non-test `.sol` in the folder, a contract named after that
file and a zero-argument constructor. The runner compiles and deploys it automatically on a local
fork. For constructor arguments or auxiliary contracts, supply `deploy({ deployContract })` in
the wrapper and return the vote contract as `omnibus` alongside the other handles. Use `deployment`
to reference already deployed contracts. See `omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts`
for a custom deployment.

The contract: description of the vote as a header comment, then vote-scoped address and role
constants, then `VOTE_ITEMS_COUNT`, then `getOmnibusCalls()`. No logic, no branching — a vote is a
list of calls, and anything conditional belongs outside the payload.

## The test

`<name>.ts` is glue, not a second description. It exports `Omnibus.create({...})` with `network`,
the lifecycle fields left `undefined`, `testVote`, and `testProposal` when the vote submits a Dual
Governance proposal. Add `deploy` or `deployment` only when the deployment path needs it.
`Omnibus.create` has **no `calls` option**: the runner reads the items and EVM script from the
deployed Solidity contract, and the test addresses items by title. For a complete test using
automatic deployment, see `omnibuses/_example_tiny_omnibus/_example_tiny_omnibus.ts`.

```ts
import { assert } from "chai";

import { HashConsensus_ABI } from "../../abi/HashConsensus.abi";
import { StakingRouter_ABI } from "../../abi/StakingRouter.abi";
import { createContracts } from "../../src/contracts";
import { event, expectedEvents as ev, Omnibus } from "../../src/omnibuses";

const contracts = createContracts({
  stakingRouter: [StakingRouter_ABI, "0xFdDf38947aFB03C621C71b06C9C70bce73f12999"],
  hashConsensus: [HashConsensus_ABI, "0xD624B08C83bAECF0807Dd2c6880C3154a5F0B288"],
});
const MODULE_ID = 1n;
const NEW_MEMBER = "0x…"; // from the description

export default Omnibus.create({
  network: "mainnet",
  voteId: undefined,
  launchedAt: undefined,
  executedAt: undefined,
  quorumReached: undefined,

  testVote: async ({ client, passOmnibus, deployment }) => {
    // expected values come from the contract under test, not from a second copy in the test;
    // the artifact ABI is untyped, hence the cast
    const shareLimit = (await client.read(deployment.omnibus, "NEW_STAKE_SHARE_LIMIT", [])) as bigint;

    const before = await client.read(contracts.stakingRouter, "getStakingModule", [MODULE_ID]);
    assert.notEqual(before.stakeShareLimit, Number(shareLimit));

    const { voteEvents } = await passOmnibus();

    voteEvents.item(
      "Update the share limit of the Curated module",
      ev.stakingRouter.moduleSharesUpdated(contracts.stakingRouter, {
        stakingModuleId: MODULE_ID,
        stakeShareLimit: shareLimit,
        priorityExitShareThreshold: 550n,
      }),
    );

    const after = await client.read(contracts.stakingRouter, "getStakingModule", [MODULE_ID]);
    assert.equal(after.stakeShareLimit, Number(shareLimit));
  },

  testProposal: async ({ passProposals }) => {
    const [proposal] = (await passProposals()).proposalEvents;
    proposal.call(0, [event(contracts.hashConsensus, "MemberAdded", [NEW_MEMBER, 9n, 5n])]);
  },
});
```

What the test owes, item by item:

- **State before and after.** Read through `client.read` with the ABIs in `abi/` (run `abi:sync`
  when a view method or an event is missing there). The checks in `src/omnibuses/checks/` cover
  the common cases — tokens, OZ roles and Aragon permissions, Easy Track factories and their
  permission blobs, staking modules; prefer them to hand-written reads.
- **Expected values read from the deployed contract** (`deployment.omnibus`), whenever the
  contract holds them as public constants. A value retyped into the test is a second source of
  truth, and it is the one that will drift.
- **Events of every item** through `voteEvents.item(title, [...])`. The title is the one in the
  contract; the helper adds the structural envelope (`LogScriptCall`, and the `ProposalSubmitted`
  pair for a Dual Governance item) itself — declare only the domain events, and use
  `expectedEvents.*` where a helper exists. A Dual Governance item with no domain events is still
  addressed: `voteEvents.item("Submit …")`. The core fails the test on any log the test did not
  account for, so an item left out is a failure, not an omission.
- **Proposal execution** through `testProposal`: `proposalEvents[i].call(j, [...])` for every
  call of every submitted proposal, plus the state checks that only hold after execution.
- **Time the execution explicitly when a call depends on it.** A call guarded by a time window
  (`TimeConstraints.checkTimeWithinDayTimeAndEmit`, anything comparing `block.timestamp` with a
  date) reverts outside that window, and the fork runner does not know the window exists — it
  lands wherever the fork block plus the delays happen to land. Set the chain time inside the
  window with `client.setTime` before `passProposals`, and when the guard is the point of the item
  also prove it holds: a snapshot, a time outside the window, the execution reverting, a revert of
  the snapshot. A test that passes only because of the fork block is a test that fails the next
  person.
- **A permission is proven by using it, not by asking about it.** Reading `hasPermission` or
  `hasRole` shows the bit flipped; it does not show the right call now works for the right caller
  and still fails for the wrong one. When the grant guards a call the description names (a manager
  managing the keys of one node operator, a committee activating a mode, a factory spending under
  a limit), impersonate the grantee with `client.impersonate` inside a snapshot and make the call:
  it succeeds for the intended arguments, reverts for the neighbouring ones (the other operator id,
  one wei over the limit, one second past the date), and reverts before the vote. Keep it to one
  call per grant — a full scenario (an Easy Track motion end to end, an oracle report) belongs to
  the suites of the owning repository, which `omnibus:multi-test` runs on the same fork.

The test never restates the payload: no targets, no calldata, no addresses of things the vote
calls beyond the contracts it needs for reading. If a check seems to need one, read it from the
deployed contract or from the chain.

## Interfaces carry only state-changing methods

An interface declares the state-changing methods of the deployed contract and nothing else. View
methods for reading state belong to the test, and the test is written elsewhere, in TypeScript,
against the ABIs that side already has. An interface padded with getters nobody calls is dead weight
in a file a reviewer has to read. `abi:sync` enforces this by default; the vote contract imports the
interface and calls what it needs.

## Work only from the description

The description in the Markdown file is the whole input. Build the calls from it and from the
typed interfaces in this repository — nothing else.

In particular, do not look for the same vote implemented somewhere else and do not copy from it.
Other repositories may contain the vote in another language, an already-deployed contract may hold
its script, and a vote that has been launched already has its payload on-chain. All of them are
off limits, for two reasons: copying an answer teaches nothing about whether the description was
sufficient, and it silently inherits whatever that other implementation got wrong.

Fetching the **ABI of a contract the vote calls** is not copying, and is expected when an interface
is missing. Fetching **the vote's own payload, script, or calldata** from any source is.

Comparing the produced script against an already executed vote is a check the reviewers run
separately, deliberately outside this skill. Do not run it, do not tune anything against it.

## Verify before reporting done

1. Format the changed Solidity files with `forge fmt <path>`; run it twice, as some constructs
   need a second pass.
2. `npm run omnibus:build -- <name>` — validates vote addresses and compiles the contract.
3. `npm run omnibus:test -- <name> --fork-block <block>` — deploys the contract to a local fork,
   validates and saves `<name>.evm-script.hex`, executes the vote, and runs state and event checks,
   including the leftover-log check. For an already executed vote, use a block before execution;
   otherwise the before-state is the state the vote already produced.
4. `npx tsc --noEmit`, `npm run lint`, `npm test`.

Use the chosen network's RPC configuration and fork setup described in
`docs/omnibuses/WRITING_OMNIBUS.md`. Record the network, fork block, results and payload hash.

Compilation proves the calls are well typed. The fork run proves the vote does what the test
says — which is only as good as the test. Whether both match the description is decided by the
reviewer and by the byte-level comparison, which happens outside this skill.

That makes the report the part reviewers depend on. Report what actually happened, including
anything that failed. State the assumptions the contract rests on, the addresses that diverge from
the registry, and the before-state the description left open, so a reviewer knows where to look
first.

## Deployment and launch

After review and fork checks, rehearse with `npx hardhat omnibus:deploy <name>` and
`npx hardhat omnibus:launch <name>`. Both use a local fork by default. Follow the guide's
deployment and launch sections for keystore prompts, IPFS upload, a persistent pinned node and
reuse of an existing deployment; these commands do not accept `--fork-block`.

Public deployment and launch each require an explicit `--broadcast`. Local rehearsals do not
establish public lifecycle facts. After a real launch, record `voteId` and `launchedAt` (the block
number); record `executedAt` after execution and `quorumReached` when known. Follow the guide's
post-launch script checks without using another vote's payload as authoring input.

## Constraints

- No TypeScript description of the calls. The contract is the description; the `.ts` has no
  `calls` section, no targets and no calldata.
- Do not fill in `voteId`, launch or execution dates before those events happen.
- Read the description only from the `<!-- OMNIBUS_DESCRIPTION -->` block when the file has one.
- Prefer an existing helper to a hand-rolled encoding; if none fits, say so rather than inlining
  raw bytes.
