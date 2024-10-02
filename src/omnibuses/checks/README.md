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
