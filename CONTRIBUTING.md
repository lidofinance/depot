# Contributing

## Setup

```bash
nvm use           # Node 22+
npm install
```

## TypeScript

- `strict: true` in tsconfig — never weaken
- No `any` in new code. Use `unknown` for untrusted data, generics for flexible types, proper interfaces for structured data
- If `any` is unavoidable (external API, complex generics), add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment explaining WHY
- Prefer `interface` for object shapes, `type` for unions/intersections/mapped types
- Use function overloads when return type depends on input (see `getOptionalEnvVar` in `src/common/env.ts`)
- Always type function parameters and return types for exported functions
- Let TypeScript infer types for local variables

## Async safety

These are ESLint errors — they block commits:

- `no-floating-promises` — every Promise must be `await`ed, returned, or explicitly `void`ed
- `no-misused-promises` — no `async` callbacks where `void` return is expected
- `require-await` — don't mark functions `async` if they don't `await` anything

## Error handling

- Always use typed errors: `throw new Error("message")`, not `throw "string"`
- Defensive throws on exhaustive checks are mandatory:
  ```typescript
  if (x === "a") return handleA();
  if (x === "b") return handleB();
  throw new Error(`Unsupported: ${x}`); // catches future additions
  ```
- Never remove defensive throws — even if TypeScript says the branch is unreachable
- Catch blocks: type error as `unknown`, narrow with `instanceof`
- Keep `?? fallback` and `?.` optional chaining for external data (API responses, JSON) — TypeScript types may not match runtime

## ESM

Project uses `"type": "module"`. Key constraints:

- `sinon.stub(esmModule, "export")` does not work — ESM exports are immutable
- For module-level dependencies use DI containers:
  ```typescript
  export const deps = { getGovernanceContracts };
  const { voting } = deps.getGovernanceContracts(network);
  ```
- For HTTP mocking, use `globalThis.fetch` override (nock v13 doesn't intercept native fetch)

## Code style

- ESLint flat config, 0 errors / 0 warnings expected
- Prettier with defaults (semi: true, printWidth: 120)
- `npm run lint` before committing

## Tests

All tests live in `test/` (not in `src/`):

- `test/<module>/<name>.unit.test.ts` — fast, no network
- `test/<module>/<name>.integration.test.ts` — needs hardhat node

```bash
npm test                    # unit tests
npm run test:integration    # integration tests
npm run test:all            # both
```

See `test/AGENTS.md` for detailed testing conventions (mocking rules, templates, mock contracts).

## Git workflow

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Pre-commit hook runs lint-staged (eslint + prettier)
- Commit-msg hook enforces conventional commits via commitlint
- Do not commit `.env`, `.keystores/`, `artifacts/`, `node_modules/`

## Verification before submitting PR

```bash
npx tsc --noEmit         # 0 errors
npm run lint             # 0 errors, 0 warnings
npm test                 # all passing
```
