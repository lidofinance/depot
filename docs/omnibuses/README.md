# Omnibus documentation

Start with [How to Write an Omnibus](WRITING_OMNIBUS.md). For agent-assisted authoring, use [omnibus-writer-sol](../../.agents/skills/omnibus-writer-sol/SKILL.md); consult its [helper catalogue](../../.agents/skills/omnibus-writer-sol/HELPERS.md) for builder levels and event/check pairs. For missing or stale ABI inputs, use [ABI sync](../ABI_SYNC.md).

## Examples by purpose

Each directory keeps its Markdown description, Solidity payload and TypeScript wrapper together. Copy a pattern, then resolve the new vote's own payload inputs and fork state.

| Example                                                                             | Purpose                                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Template](../../omnibuses/_omnibus_template)                                       | Three-file scaffold used by `npm run omnibus:create`.                                               |
| [Tiny](../../omnibuses/_example_tiny_omnibus)                                       | One Finance payment, automatic deployment, typed reads of vote constants and balance/event checks.  |
| [Contract](../../omnibuses/_example_contract_omnibus)                               | Custom deployment with an auxiliary validator and DG proposals.                                     |
| [Finance](../../omnibuses/_example_finance_omnibus)                                 | Automatic deployment, stETH payment with share/balance checks and a script match against vote #200. |
| [Agent / DG / Kernel](../../omnibuses/_example_agent_dg_kernel_omnibus)             | Explicit proposal metadata, Agent forwards and Kernel implementation/permission checks.             |
| [Permissions / Node operators](../../omnibuses/_example_permissions_node_operators) | ACL parameter grants, permission-use probes, node-operator changes and grouped events.              |

For Easy Track and allowed-recipient operations, see the helper catalogue and the paired library/event tests it links. Full protocol regressions use the [cross-repository runbook](WRITING_OMNIBUS.md#cross-repository-checks) and [mount examples](../../mount/README.md).

Examples and archived payloads describe particular states; a historical successful run is not a guarantee about latest state. `omnibus:test` is for an unexecuted omnibus; use `omnibus:trace` for recorded execution. Build, test and deploy include address lint; validate explicitly before launch.
