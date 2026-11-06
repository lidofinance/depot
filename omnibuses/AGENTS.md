# Omnibus conventions

For creating or modifying an omnibus or its fork tests, follow [omnibus-writer-sol](../.agents/skills/omnibus-writer-sol/SKILL.md) and the [writing guide](../docs/omnibuses/WRITING_OMNIBUS.md). Select the relevant pattern from the [examples catalogue](../docs/omnibuses/README.md).

- Current candidates live in `ongoing/<network>/<name>`, executed votes in `archive/<network>/<name>`, patterns in `examples/`. Ask the author whether the vote is an upgrade and record `upgrade` in the wrapper.
- Never run `--broadcast` deploy or launch against Mainnet/Hoodi and never read keystore contents; real operations are human-only. Agents rehearse on a local fork; `omnibus:create/deploy/launch` are interactive, so without a TTY ask the user to run the one-line command.
- Solidity owns the calls and script; TypeScript supplies tests and deployment; `<name>.ipfs.md` holds the public vote text that launch publishes verbatim. Resolve payload-changing gaps in the description before encoding them.
- Keep every vote address as a literal local named constant; a reviewer confirms each against an official source ([Addresses and titles](../docs/omnibuses/WRITING_OMNIBUS.md#addresses-and-titles)). Copy unique titles without item numbering and preserve exact fenced DG metadata.
- Match the execution route to the target's permissions. Register domain events for every vote/proposal call, preserving nested Agent groups, and verify state effects.
- Use the runtime's outer snapshot; changes may persist between its test callbacks. `omnibus:test` checks an executed vote by its on-chain state and `testFinalState`; historical inspection uses `omnibus:trace`.
- Run the guide's validation path before launch. `voteId` is recorded by a broadcast launch, never by hand from a rehearsal.
