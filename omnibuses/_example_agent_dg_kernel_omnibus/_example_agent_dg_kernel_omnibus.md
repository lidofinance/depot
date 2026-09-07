# Agent, Dual Governance and Kernel helper example

<!-- OMNIBUS_DESCRIPTION -->

1. Submit a proposal to upgrade the fixture Kernel app

Aragon Voting `0x2e59A20f205bB85a89C53f1936454680651E618e` submits the proposal to Dual Governance `0xC1db28B3301331277e307FDCfF8DE28242A4486E`. Its two calls go through Aragon Agent `0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c`:

1. Forward one call to ACL `0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb`, temporarily granting Agent `APP_MANAGER_ROLE` on Kernel `0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc`.
2. Forward one script containing two calls: update the fixture app's base to implementation V2, then revoke that permission through ACL.

The app ID is `keccak256("depot.agent-dg-kernel-example")`. The Kernel namespace is `keccak256("base")`; the role is `keccak256("APP_MANAGER_ROLE")`. The old implementation is `0x0000000000000000000000000000000000000701` and the new implementation is `0x0000000000000000000000000000000000000702`.

<!-- OMNIBUS_DESCRIPTION -->

<!-- DG_PROPOSAL_DESCRIPTIONS -->

### Item 1

```text
1. Temporarily grant APP_MANAGER_ROLE to Aragon Agent on Kernel.
2. In one Agent forward, upgrade the fixture app to implementation V2 and revoke APP_MANAGER_ROLE.
```

<!-- DG_PROPOSAL_DESCRIPTIONS -->

## Scope

This is a local fork fixture, not a production vote. The test places two mock implementations at the declared fixture addresses and registers V1 under a separate app ID using the Agent's real permission-management authority. It does not replace protocol code or edit permission storage. The omnibus runner's snapshot restores the fixture after the complete vote and proposal test.

The Solidity contract describes the entire vote. The TypeScript test verifies that vote enact only submits the proposal; execution changes the selected app base from V1 to V2. It checks both implementations' version results, revocation of the temporary permission, rejection of further Agent and stranger updates, bytewise equality with the newly created vote script, and all vote/proposal events. Agent structural events are supplied automatically; a grouped forward has one domain-event group per nested call.

The temporary permission sequence follows the current Kernel governance model used in `scripts/archive/scripts/upgrade_2026_07_15_srv3_cmv2.py`. The example uses no historical protocol implementation.

## Verification

Verified on 2026-09-06 with Node 22.10.0 on an isolated in-process mainnet fork at block **25918463**:

```bash
npm run omnibus:test -- _example_agent_dg_kernel_omnibus --fork-block 25918463
```

- The 1248-byte EVM script has keccak256 `0xf7917291a3e907f88ebc2c01fdd2674a74ca57b842dfa7842e59fd21bb5b4318`. It matched the script of the freshly executed vote **205** through `isValidVoteScript`.
- Vote enact submitted proposal **14** and left the fixture app on V1. Proposal execution granted the temporary role, upgraded the selected Kernel app to V2 and revoked the role. Version reads returned 1 before execution and 2 afterwards.
- Agent and stranger calls to Kernel without the role reverted with `KERNEL_AUTH_FAILED`, before the vote, after vote enact and after proposal execution. The test verified that Agent already held the real permission-manager authority before creating the fixture.
- The vote's `LogScriptCall`, both `ProposalSubmitted` events, `ScriptResult` and `ExecuteVote` were checked. Proposal checks covered all three nested `LogScriptCall` events, both `SetPermission` events, `SetApp`, both Agent `ScriptResult` events, both executor `Executed` events and `ProposalExecuted`. Both receipts passed the runner's no-leftover-events check.
- The runner completed its snapshot/revert cleanup and the command exited successfully, ending the in-process fork. No assertions were skipped and no real-network transactions were sent.
- A second full run also passed after moving only this example's generated mock-artifact directory out of `artifacts/`. The fixture build recreated both implementation artifacts and refreshed the artifact lookup cache; vote 205 and proposal 14 again passed all state and event checks.

Earlier attempts stopped before vote creation: the sandbox could not initialize Hardhat's native macOS networking; mock artifacts needed an explicit scoped build and artifact-cache refresh; the negative check initially expected the generic Aragon app error instead of Kernel's own error. Those attempts are not counted as successful tests. The example now prepares its own mock artifacts, and the successful run used the verified Kernel revert expectation outside the sandbox.
