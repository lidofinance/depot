# Claude Code Instructions

Read `AGENTS.md` for project setup, architecture, conventions, and verification checklist.

## Skills

Project skills live in `.agents/skills/` (cross-platform standard). For omnibus work, follow `.agents/skills/omnibus-writer/SKILL.md`.

## Omnibus quick flow

When user asks to create, modify, or review an omnibus — follow `docs/omnibuses/WRITING_OMNIBUS.md`.

Quick flow for `omnibus create`:

1. `npm run omnibus:create`
2. User fills description in `omnibuses/<name>/<name>.md` inside `<!-- OMNIBUS_DESCRIPTION -->`
3. Transform description into calls in `<name>.ts`
4. Ask if Solidity contract is needed
5. If yes: `npm run omnibus:contract -- <name>`, then `npm run omnibus:build -- <name>`
