# Code Review Checklist

When reviewing or writing code in `src/`, follow `CONTRIBUTING.md` for coding conventions and check by severity:

## CRITICAL (block merge)

- Hardcoded secrets, private keys, API tokens
- Unvalidated user/external input passed to contract calls
- Missing `await` on transaction/RPC calls
- Removed defensive throws or error guards
- Removed `?? fallback` or `?.` on external data without proving it's safe

## HIGH (must fix)

- `any` without eslint-disable comment explaining why
- Empty catch blocks (swallowed errors)
- Unguarded `JSON.parse` on external data
- `as` type assertions without runtime validation
- Mutable module-level state without synchronization
- `sinon.stub(esmModule, "export")` — will crash at runtime

## MEDIUM (should fix)

- Unused variables/imports
- Functions over 50 lines
- Deep nesting (> 3 levels)
- Missing error messages in throws
- Magic numbers/strings without named constants
