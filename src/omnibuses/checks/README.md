# Checks

Reusable post-vote assertions for omnibus tests. Each check takes a `CheckContext` first and its input second:

```typescript
export interface CheckContext {
  client: DevRpcClient;
}
```

Checks read state through `client` and assert with `assert` from `src/common/assert`.

## Usage

`testVote` and `testFinalState` receive `checks` with the context already bound, so call them without it:

```typescript
testVote: async ({ checks, passOmnibus }) => {
  await passOmnibus();

  await checks.tokens.checkERC20Balance({ token: LDO, account: RECIPIENT, expectedBalance: AMOUNT });
  await checks.easyTrack.checkFactoryExists(contracts, FACTORY);
  await checks.accessControl.checkAragonPermissionGranted({
    contracts: { acl: contracts.acl },
    entity: contracts.agent.address,
    app: contracts.lido.address,
    role: STAKING_CONTROL_ROLE,
  });
},
```

Groups: `accessControl`, `easyTrack`, `stakingRouter`, `tokens`.

## Adding a check

Add a `(context: CheckContext, input) => Promise<void>` function to the group's file and its default export. A new group file must also be registered in `checks.ts`; `BoundChecks` picks it up from there.
