# Omnibus conventions

For creating or modifying an omnibus or its fork tests, follow [omnibus-writer-sol](../.agents/skills/omnibus-writer-sol/SKILL.md) and the [writing guide](../docs/omnibuses/WRITING_OMNIBUS.md). Select the relevant pattern from the [examples catalogue](../docs/omnibuses/README.md).

- Solidity owns the calls and script; TypeScript supplies tests and deployment. Resolve payload-changing gaps in the description before encoding them.
- Keep every vote address as a literal local named constant. Copy unique titles without item numbering and preserve exact fenced DG metadata.
- Match the execution route to the target's permissions. Register domain events for every vote/proposal call, preserving nested Agent groups, and verify state effects.
- Use the runtime's outer snapshot; changes may persist between its two test callbacks. A defined `executedAt` makes `omnibus:test` reject replay; historical inspection uses `omnibus:trace`.
- Run the guide's validation path before launch. Build/test/deploy have address guards; launch does not. Public lifecycle fields describe actual milestones, not rehearsals.
