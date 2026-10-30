# Test Conventions

Rules for writing tests in `test/`.

## Layout and running

- `test/depot/<module>/<name>.unit.test.ts` — Depot logic, no network, mock dependencies.
- `test/depot/<module>/<name>.integration.test.ts` — Depot integration paths with in-process Hardhat; fork cases require `ETH_MAINNET_RPC_URL`.
- `test/protocol/acceptance/` — shared checks of deployed protocol state after vote/DG execution and event checks, before snapshot restore.
- `test/protocol/helpers/` — acceptance infrastructure only (client, revert matching, impersonation, oracle reports); expected values stay in each suite.
- `test/protocol/snapshot/` — reserved for future upgrade snapshot suites; no snapshot tests yet.

Per-vote `testVote`/`testProposal` checks stay in `omnibuses/<name>/*.ts`. Shared Depot helpers live in `test/depot/helpers/`.

```bash
npm run test:depot:unit         # npm test is a shortcut
npm run test:depot:integration  # no separate node required
npm run test:all                # both Depot suites
```

Protocol acceptance runs through `omnibus:test`, which loads the ordered `ACCEPTANCE_SUITES` list from `tasks/sub-tasks/acceptance.ts` and fails if a suite in `test/protocol/acceptance/` is missing from it; Depot globs select only `test/depot/`.

## When to write which

**Unit tests** — pure logic, data transforms, parsers, formatters:

- No blockchain, no network, no Docker
- Mock external deps via DI containers or plain object stubs
- Fast (< 1s per test)

**Integration tests** — anything that calls smart contracts:

- Deploy mock contracts from `contracts/mocks/` in an in-process Hardhat environment
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

## Mock contracts

Solidity mocks live in `contracts/mocks/`:

- `MockERC20.sol` — mintable ERC20
- `MockVoting.sol` — newVote/executeVote/getVote + events
- `MockTokenManager.sol` — forward(evmScript) with EVM script parsing
- `MockHashConsensus.sol` — minimal HashConsensus for AccountingOracle `setConsensusContract` guards

Deploy helper: `test/depot/helpers/deploy-mock-governance.ts`

## Review checklist for tests

- Every new function in `src/` should have at least one test
- Integration tests use `snapshot()`/`revert()` for isolation
- No real API calls in unit tests (mock fetch, mock etherscan)
- `afterEach(() => sinon.restore())` in every describe block that uses sinon
- `afterEach` for globalThis.fetch restoration
