# Claude Code Instructions

Read `AGENTS.md` for project setup, architecture, conventions, and verification checklist.

## Skills

Project skills live in `.agents/skills/` (cross-platform standard). For omnibus authoring and fork tests, follow `.agents/skills/omnibus-writer-sol/SKILL.md`.

## Omnibus quick flow

When user asks to create, modify, or review an omnibus — follow `docs/omnibuses/WRITING_OMNIBUS.md`.

The scaffold is created with `npm run omnibus:create`. The author supplies the Markdown
description; the skill resolves missing payload inputs before implementation. Define calls in
`Omnibus_<name>.sol` and checks in `<name>.ts`, with custom deployment only when needed.

Build with `npm run omnibus:build -- <name>` and test with
`npm run omnibus:test -- <name> --fork-block <block>`. Follow the guide for quality checks,
deployment and launch. Mainnet and Hoodi use the same workflow.
