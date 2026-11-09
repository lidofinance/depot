# Test Conventions

Rules for writing tests in `test/`.

## Layout and running

- `test/depot/<module>/<name>.unit.test.ts` — Depot logic, no network, mock dependencies.
- `test/depot/<module>/<name>.integration.test.ts` — Depot integration paths with in-process Hardhat.
- `test/protocol/acceptance/` — shared checks of deployed protocol state after vote/DG execution and event checks, before snapshot restore.
- `test/protocol/helpers/` — protocol test mechanics (client, revert matching, impersonation, oracle reports, snapshot comparison and storage reads); expected values stay in each suite.
- `test/protocol/snapshot/` — old/upgraded comparisons that `omnibus:test` runs for `upgrade: true` votes; see [the writing guide](../docs/omnibuses/WRITING_OMNIBUS.md).

Per-vote `testVote`/`testProposal` checks stay in the vote wrapper `omnibuses/ongoing/<network>/<name>/<name>.ts`. Shared Depot helpers live in `test/depot/helpers/`.

```bash
npm run test:depot:unit         # npm test is a shortcut
npm run test:depot:integration  # no separate node required
npm run test:all                # both Depot suites
```

Protocol acceptance runs through `omnibus:test`, which loads the ordered `ACCEPTANCE_SUITES` list from `tasks/sub-tasks/acceptance.ts` and fails if a suite in `test/protocol/acceptance/` is missing from it; Depot globs select only `test/depot/`. For `upgrade: true` votes `omnibus:test` runs acceptance once on a clean pass, then `tasks/sub-tasks/snapshot.ts` runs every snapshot case through the full vote/DG lifecycle with its own fixtures and without acceptance. Allowed differences live in each suite next to its comparison; vote-specific effects belong to the wrapper tests.

## When to write which

**Unit tests** — pure logic, data transforms, parsers, formatters:

- No blockchain, no network, no Docker
- Mock external deps via DI containers or plain object stubs, e.g. `sinon.stub(omnibusTaskDeps, "getOmnibusesDir")`
- Fast (< 1s per test)

**Integration tests** — anything that calls smart contracts:

- Deploy mock contracts from `contracts/mocks/` in an in-process Hardhat environment
- Use `DevRpcClient` for `snapshot()`/`revert()` between tests
- Pass mock contract names/addresses explicitly, e.g. `deployOmnibusForLaunch(hre, client, omnibus, "MockVoting", …)`; DI containers such as `omnibusTaskDeps` hold functions only

## Mocking rules (ESM)

The project uses `"type": "module"`. This limits what sinon can stub:

```typescript
// OK — plain objects, class methods
sinon.stub(deps, "resolveContractInfo").resolves(mock);
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

describe("feature (integration)", function () {
  let client: DevRpcClient;
  let snapshotId: HexStrPrefixed;

  before(async function () {
    client = await createInProcessDevRpcClient();
  });

  beforeEach(async function () {
    snapshotId = await client.snapshot();
  });

  afterEach(async function () {
    await client.revert(snapshotId);
  });

  it("lands the next block on the target timestamp", async function () {
    const target = (await client.getChainTime()) + 3600;

    await client.setTime(target);

    assert.equal(await client.getChainTime(), target);
  });
});
```

## Mock contracts

Solidity mocks live in `contracts/mocks/`:

- `MockVoting.sol` — newVote/executeVote/getVote + events
- `MockHashConsensus.sol` — minimal HashConsensus for AccountingOracle `setConsensusContract` guards
- `MockKernelAppImplementation.sol` — V1/V2 app implementations reporting `version()`
- `MockSnapshotCallTarget.sol` — one-shot call target for snapshot tests

## Review checklist for tests

- Add a test only for logic whose silent breakage would change the vote payload, description/metadata, signing or keys; ask before adding others. Dev tools (`omnibus:trace`, `abi:sync`) are intentionally lightly tested.
- Integration tests use `snapshot()`/`revert()` for isolation
- No real API calls in unit tests (mock fetch, mock etherscan)
- `afterEach(() => sinon.restore())` in every describe block that uses sinon
- `afterEach` for globalThis.fetch restoration
