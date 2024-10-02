# Checks

This folder contains the checks for the omnibuses.

Each check is a function which accepts the CheckContext as a first argument.

```typescript
export interface CheckContext {
  contracts: Contracts<Lido>;
  provider: JsonRpcProvider;
}
```

Check should call assertions from the `assert` module imported from `common/assert` module.

# Example

```typescript
// checks/supply.ts
import { CheckContext } from "./checks";
import { assert } from "./common/assert";

export async function checkTotalSupply(context: CheckContext, amount: BigNumber) {
  const { contracts, provider } = context;

  const totalSupply = await contracts.lido.totalSupply();
  assert.equal(totalSupply, amount, `Total supply should be ${amount}`);
}

export default {
  checkTotalSupply,
};
```

If you're adding a new file, don't forget to reexport your checks in the `checks.ts` file.

```typescript
import supply from "./supply";

export default {
  ...supply,
};
```

Check written in this way can be used in the tests like this:

```typescript
import checks from "../src/omnibuses/checks";

const { supply } = checks.mainnet;

describe("Check total supply", () => {
  it("should be 1000", async () => {
    await supply.checkTotalSupply(context, 1000);
  });
});
```
