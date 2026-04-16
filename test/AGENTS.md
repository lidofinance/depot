# Test Conventions

Rules for writing tests in `test/`.

## File naming

- `test/<module>/<name>.unit.test.ts` — fast, no network, mock dependencies
- `test/<module>/<name>.integration.test.ts` — needs running hardhat node

## Running

```bash
npm test                    # unit tests only
npm run test:integration    # integration tests (start hardhat node first)
npm run test:all            # both
```

## When to write which

**Unit tests** — pure logic, data transforms, parsers, formatters:

- No blockchain, no network, no Docker
- Mock external deps via DI containers or plain object stubs
- Fast (< 1s per test)

**Integration tests** — anything that calls smart contracts:

- Deploy mock contracts from `contracts/mocks/` on local hardhat node
- Use `DevRpcClient` for `snapshot()`/`revert()` between tests
- Override DI containers (`lifecycleDeps`, `testingDeps`, `tracerDeps`) to point to mock contract addresses

## Mocking rules (ESM)

The project uses `"type": "module"`. This limits what sinon can stub:

```typescript
// OK — plain objects, class methods
sinon.stub(deps, "getGovernanceContracts").returns(mock);
sinon.stub(ContractInfoResolver, "resolve").resolves(mock);

// FORBIDDEN — ESM module exports are immutable
sinon.stub(module, "exportedFunction"); // TypeError at runtime
```

**For module-level dependencies:**
Source code exposes DI containers (`export const deps = { fn }`).
Tests stub the container: `sinon.stub(deps, "fn")`.

**For HTTP (fetch):**

```typescript
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

globalThis.fetch = async () => new Response(JSON.stringify(mockData));
```

## Unit test template

```typescript
import { assert } from "chai";
import sinon from "sinon";

describe("ModuleName", () => {
  afterEach(() => sinon.restore());

  it("does something specific", () => {
    // arrange
    // act
    // assert
  });
});
```

## Integration test template

```typescript
import { assert } from "chai";
import { createDevRpcClient } from "../../src/network/network";
import { deployMockGovernance } from "../helpers/deploy-mock-governance";
import { HexStrPrefixed } from "../../src/common/bytes";

const RPC_URL = process.env.TEST_RPC_URL ?? "http://localhost:8545";

describe("feature (integration)", function () {
  let client, snapshotId;

  before(async function () {
    client = await createDevRpcClient("mainnet", RPC_URL);
    // deploy mocks, override DI containers
  });

  beforeEach(async function () {
    snapshotId = await client.snapshot();
  });

  afterEach(async function () {
    await client.revert(snapshotId);
  });

  it("interacts with contracts", async function () {
    // real contract calls on local hardhat node
  });
});
```

## Mock contracts

Solidity mocks live in `contracts/mocks/`:

- `MockERC20.sol` — mintable ERC20
- `MockVoting.sol` — newVote/executeVote/getVote + events
- `MockTokenManager.sol` — forward(evmScript) with EVM script parsing

Deploy helper: `test/helpers/deploy-mock-governance.ts`

## Review checklist for tests

- Every new function in `src/` should have at least one test
- Integration tests use `snapshot()`/`revert()` for isolation
- No real API calls in unit tests (mock fetch, mock etherscan)
- `afterEach(() => sinon.restore())` in every describe block that uses sinon
- `afterEach` for globalThis.fetch restoration
