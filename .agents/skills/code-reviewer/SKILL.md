---
name: code-reviewer
description: Review code for bugs, security issues, and quality problems. Handles any scope — a single file, a function, a whole module, staged changes, a PR diff, or an audit of third-party code. Use when the user asks to "review", "check", "audit", or validate code. Focuses on finding issues, does not refactor.
---

# Code Reviewer

Review code for bugs, security issues, and quality problems. Report findings by severity, do not refactor.

## Workflow

1. **Establish scope**

   The user determines what to review. Support all of these:
   - **A specific file or directory** — e.g. "review `src/network/rpc-client.ts`" or "audit `src/docker/`"
   - **A specific function or class** — find it with grep/read, review the function plus its direct callers
   - **Staged changes** — `git diff --staged`
   - **Current branch vs main** — `git diff main...HEAD`
   - **Last commit** — `git show --patch HEAD`
   - **Specific commit(s)** — `git show <sha>` or `git log <range>`
   - **External / third-party code** — user pastes or points to files outside the repo

   If the user's request is ambiguous, ask what to review. Don't default to diffs.

   If the scope is inside this repo, run `npm run lint` and `npx tsc --noEmit` first — if either fails, note it in the report but continue the review.

2. **Read with context**

   Read the FULL file, not just the diff. Bugs often live in how changes interact with surrounding code.

3. **Follow project conventions**

   Read and enforce:
   - `CONTRIBUTING.md` — TypeScript, async safety, error handling, ESM rules
   - `src/AGENTS.md` — review checklist (this document extends it)
   - `test/AGENTS.md` — test mocking rules

4. **Report findings by severity** (see below). One issue per finding. Explain WHY it matters and how to fix.

5. **Do NOT refactor code.** Only report. Let the author fix.

## Severity levels

### CRITICAL (block merge)

- Hardcoded secrets: private keys, API tokens, passwords
- Unvalidated user/external input passed to contract calls or shell commands
- Missing `await` on transaction / RPC calls — lost transactions, silent failures
- Removed defensive throws or error guards
- Removed `?? fallback` or `?.` on external data without proving it's safe at runtime
- SQL / NoSQL / shell command injection
- Auth bypass, CSRF, missing authorization checks
- Unsafe `eval`, `new Function`, `child_process` with untrusted input

### HIGH (must fix before merge)

- `any` without `eslint-disable-next-line` comment explaining why
- Empty catch blocks — swallowed errors
- Unguarded `JSON.parse` on external data
- `as` type assertions without runtime validation
- Non-null assertions (`!`) without nearby guard
- `@ts-ignore` / `@ts-nocheck` without explanation
- `sinon.stub(esmModule, "export")` — fails at runtime in ESM
- Mutable module-level state shared across async calls
- Missing event expectations in omnibus calls (see `omnibuses/AGENTS.md`)
- Async callbacks in void contexts (`process.on("SIGINT", async () => ...)`)
- `forEach` with async callback (errors are swallowed)

### MEDIUM (should fix)

- Functions over 50 lines
- Deep nesting (> 3 levels)
- Missing error messages in throws
- Magic numbers / strings without named constants
- Large files (> 500 lines) — consider splitting
- Unused variables / imports
- Inconsistent naming
- N+1 queries / loops

### LOW (nice to have)

- Missing comments on non-obvious logic
- Minor style inconsistencies
- TODO comments without tracking issue

## Output format

Group findings by severity. For each:

```
**CRITICAL** — <short title>
File: `path/to/file.ts:LINE`
Issue: <what's wrong>
Why: <why it matters>
Fix: <concrete suggestion>
```

End with a verdict:

- **Approve** — no CRITICAL or HIGH issues
- **Changes requested** — any CRITICAL or HIGH issue
- **Needs attention** — only MEDIUM/LOW issues

## Special attention for AI-generated code

When code looks AI-generated, check additionally:

- Removed defensive code that "looks unnecessary" — defensive throws, fallback values, null checks
- Type assertions replacing actual type narrowing
- Complex generic tricks where simple types would work
- Comments that describe WHAT (obvious) instead of WHY

## References

- Coding conventions: `CONTRIBUTING.md`
- Project architecture: `AGENTS.md`
- Test conventions: `test/AGENTS.md`
- Omnibus-specific: `omnibuses/AGENTS.md`
