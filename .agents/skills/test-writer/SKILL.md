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
   - **Integration test** (`.integration.test.ts`) — anything that calls smart contracts. Deploy mocks on an in-process Hardhat network.

   When in doubt, prefer unit tests. Integration tests only when contract interaction is the actual subject of the test.

3. **Locate test file**

   Depot tests go in `test/depot/<module>/<name>.(unit|integration).test.ts`, mirroring source structure. Protocol acceptance and upgrade snapshot suites go in `test/protocol/acceptance/` and `test/protocol/snapshot/` as plain `.test.ts` files. Per-vote checks stay beside the payload in `omnibuses/ongoing/<network>/<name>/<name>.ts`.

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
   npm run test:depot:unit              # Depot unit
   npm run test:depot:integration       # Depot integration
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
import { thingDeps, doThing } from "@/src/feature/thing";

it("does the thing", () => {
  sinon.stub(thingDeps, "externalFn").returns("mocked");
  assert.equal(doThing(), "mocked");
});
```

If the code you're testing doesn't have a DI container, add one to the source as part of your test PR. Examples: `lifecycleDeps`, `testingDeps`, `tracerDeps`.

## HTTP mocking

Project uses native `fetch()`. Override `globalThis.fetch`:

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

Helper pattern for multiple responses, see `test/depot/contracts/etherscan-provider.unit.test.ts`.

## Integration test pattern

Starts an in-process Hardhat network, deploys mocks from `contracts/mocks/` and isolates tests with snapshots (see `test/AGENTS.md`):

```typescript
import { assert } from "chai";
import { DevRpcClient } from "@/src/network/dev-rpc-client";
import { HexStrPrefixed } from "@/src/common/bytes";
import { createInProcessDevRpcClient } from "../helpers/create-dev-client";
import { deployMockGovernance, MockGovernanceContracts } from "../helpers/deploy-mock-governance";

describe("feature (integration)", function () {
  let client: DevRpcClient;
  let mocks: MockGovernanceContracts;
  let snapshotId: HexStrPrefixed;

  before(async function () {
    client = await createInProcessDevRpcClient();
    const [deployer] = await client.getAccounts();
    mocks = await deployMockGovernance(client, deployer);
  });

  beforeEach(async function () {
    snapshotId = await client.snapshot();
  });

  afterEach(async function () {
    await client.revert(snapshotId);
  });

  it("starts with zero token supply", async function () {
    assert.equal(await client.read(mocks.ldo, "totalSupply"), 0n);
  });
});
```

## Mock Solidity contracts

Live in `contracts/mocks/`. Current mocks:

- `MockERC20.sol` — mintable ERC20
- `MockVoting.sol` — Aragon Voting subset
- `MockTokenManager.sol` — TokenManager with EVM script parsing
- `MockHashConsensus.sol` — minimal HashConsensus for AccountingOracle `setConsensusContract` guards
- `MockKernelAppImplementation.sol` — V1/V2 app implementations reporting `version()`
- `MockOmnibus.sol` — minimal `OmnibusBase` with one call
- `MockSnapshotCallTarget.sol` — one-shot call target for snapshot tests

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
- Real integration test: `test/depot/aragon-votes/lifecycle.integration.test.ts`
- Real unit test with fetch mock: `test/depot/contracts/etherscan-provider.unit.test.ts`
- Real unit test with DI stub: `test/depot/traces/tx-tracer.unit.test.ts`
