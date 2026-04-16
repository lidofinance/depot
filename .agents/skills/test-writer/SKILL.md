---
name: test-writer
description: Write unit or integration tests for existing code following project conventions (ESM constraints, DI containers, mock contracts). Use when user asks to "write tests", "add test coverage", or after implementing a new feature that needs testing.
---

# Test Writer

Write unit or integration tests for existing TypeScript code. Respect project conventions around ESM, sinon limitations, and DI patterns.

## Workflow

1. **Read context first**
   - `test/AGENTS.md` — naming, mocking rules, templates
   - `CONTRIBUTING.md` — TypeScript and ESM conventions
   - Existing tests in the same module as reference
   - The code being tested

2. **Choose test type**
   - **Unit test** (`.unit.test.ts`) — pure logic, no network, no contracts. Mock external deps via DI containers or plain object stubs.
   - **Integration test** (`.integration.test.ts`) — anything that calls smart contracts. Deploy mocks on hardhat node.

   When in doubt, prefer unit tests. Integration tests only when contract interaction is the actual subject of the test.

3. **Locate test file**

   Tests go in `test/<module>/<name>.(unit|integration).test.ts`, mirroring source structure. Do NOT put tests in `src/`.

4. **Write tests**

   Cover:
   - Happy path
   - Error paths (invalid input, exceptions)
   - Edge cases (empty, null, boundaries)
   - State transitions if the code has state

   For integration tests, cover pre/post state with `snapshot()`/`revert()`.

5. **Verify**

   Run the new tests:

   ```bash
   npm test                            # unit
   npm run test:integration            # integration (needs hardhat node)
   ```

   Run typecheck:

   ```bash
   npx tsc --noEmit
   ```

## ESM constraints (critical)

The project uses `"type": "module"`. Sinon CANNOT stub module-level exports:

```typescript
// BROKEN — throws "ES Modules cannot be stubbed" at runtime
import * as mod from "./my-module";
sinon.stub(mod, "exportedFn");

// OK — plain objects and class methods are stubbable
sinon.stub(myObj, "method");
sinon.stub(MyClass, "staticMethod");
```

### Pattern for module-level dependencies: DI containers

If the code under test imports a function from another module and calls it, and you need to stub that function:

**Source code must expose a mutable container:**

```typescript
// src/feature/thing.ts
import { externalFn } from "../other/module";

export const thingDeps = { externalFn };

export function doThing() {
  return thingDeps.externalFn(); // call through container
}
```

**Test stubs the container (plain object — works in ESM):**

```typescript
import { thingDeps, doThing } from "../../src/feature/thing";

it("does the thing", () => {
  sinon.stub(thingDeps, "externalFn").returns("mocked");
  assert.equal(doThing(), "mocked");
});
```

If the code you're testing doesn't have a DI container, add one to the source as part of your test PR. Examples: `lifecycleDeps`, `testingDeps`, `tracerDeps`.

## HTTP mocking

Project uses native `fetch()`. Nock v13 does NOT intercept native fetch. Use `globalThis.fetch` override:

```typescript
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

it("handles API response", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as typeof globalThis.fetch;

  // test code that calls fetch...
});
```

Helper pattern for multiple responses, see `test/contracts/etherscan-provider.unit.test.ts`.

## Integration test pattern

Connects to a running hardhat node, deploys mocks from `contracts/mocks/`, overrides DI containers:

```typescript
import { createDevRpcClient } from "../../src/network/network";
import { deployMockGovernance } from "../helpers/deploy-mock-governance";
import { lifecycleDeps } from "../../src/aragon-votes-tools/lifecycle";
import type { HexStrPrefixed } from "../../src/common/bytes";

const RPC_URL = process.env.TEST_RPC_URL ?? "http://localhost:8545";

describe("feature (integration)", function () {
  let client, mocks, snapshotId: HexStrPrefixed;
  let originalDeps: typeof lifecycleDeps.getGovernanceContracts;

  before(async function () {
    client = await createDevRpcClient("mainnet", RPC_URL);
    const [deployer] = await client.getAccounts();
    mocks = await deployMockGovernance(client, deployer);
    originalDeps = lifecycleDeps.getGovernanceContracts;
    lifecycleDeps.getGovernanceContracts = () => mocks as any;
  });

  after(() => {
    lifecycleDeps.getGovernanceContracts = originalDeps;
  });

  beforeEach(async () => {
    snapshotId = await client.snapshot();
  });
  afterEach(async () => {
    await client.revert(snapshotId);
  });

  it("does something on-chain", async function () {
    // real contract calls
  });
});
```

## Mock Solidity contracts

Live in `contracts/mocks/`. Current mocks:

- `MockERC20.sol` — mintable ERC20
- `MockVoting.sol` — Aragon Voting subset
- `MockTokenManager.sol` — TokenManager with EVM script parsing

Extend existing mocks before adding new ones. If you add a new mock:

1. Minimal implementation — only functions used by tests
2. Emit events that tests assert against
3. Compile via `npx hardhat compile`

## Anti-patterns (do NOT do these)

- `sinon.stub(esmModule, "fn")` — use DI container
- Tests that make real HTTP calls — mock `globalThis.fetch`
- Tests that require real mainnet RPC — use mocks on hardhat network
- `forEach` with async — use `for ... of` or `Promise.all`
- Shared mutable state between tests — use `beforeEach` reset or snapshot/revert
- Skipping assertions ("just run it and see") — tests must fail when broken

## References

- `test/AGENTS.md` — naming, templates, mock rules
- `CONTRIBUTING.md` — TS/ESM conventions
- Real integration test: `test/aragon-votes/lifecycle.integration.test.ts`
- Real unit test with fetch mock: `test/contracts/etherscan-provider.unit.test.ts`
- Real unit test with DI stub: `test/traces/tx-tracer.unit.test.ts`
