# Omnibus Conventions

For authoring and fork tests, read `docs/omnibuses/WRITING_OMNIBUS.md` and `.agents/skills/omnibus-writer-sol/SKILL.md`.

## Authoring

1. Run `npm run omnibus:create` to scaffold the Markdown placeholder, Solidity contract, and TypeScript test.
2. The author supplies the vote description inside `<!-- OMNIBUS_DESCRIPTION -->` in the Markdown file.
3. Implement the vote in Solidity. Declare vote addresses as local named constants with visible literal values, including addresses also present in shared infrastructure lists.
4. Add state checks and event expectations in TypeScript. A single contract with a zero-argument constructor is deployed automatically; use `deploy` when auxiliary contracts or constructor arguments require it.

Keep lifecycle fields `undefined` until the corresponding real milestone. Use unique item titles without numbering; the runtime numbers them. Each numbered description item corresponds to one call of its parent.

## Examples

- `_omnibus_template/` — three-file scaffold; the contract must be filled before testing.
- `_example_tiny_omnibus/` — one-item vote, automatic deployment, balance deltas and event matching.
- `_example_contract_omnibus/` — auxiliary deployment and Dual Governance proposal tests.

## Verification

Use `checks.*` and `expectedEvents.*` where they cover the item. Prove each item's state change and register its events through `voteEvents.item(title, events)`. For submitted Dual Governance proposals, add `testProposal` with execution checks and events for every proposal call. The runner checks for unexplained logs and restores its snapshot.

Determine the target's permission model before choosing the caller or testing a grant: Aragon ACL and OpenZeppelin AccessControl use different methods. Prove permission changes with the intended caller where applicable.

Run `npm run omnibus:build -- <name>`, `npm run omnibus:test -- <name> --fork-block <block>`, and the repository quality checks. Mainnet and Hoodi use the same workflow. Follow the guide for deployment, local rehearsals, and launch.
