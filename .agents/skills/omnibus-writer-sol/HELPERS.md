# Omnibus helper catalogue

During phase 1, match each description action to its helper, builder level, caller and event expectation here. Resolve missing payload inputs through the inventory process in [SKILL.md](SKILL.md). These examples illustrate the API; their symbolic inputs must come from the author's description or the repository, not from invented defaults.

## Builders and event registration

All signatures below are `internal pure` library functions. The tables omit the first `self` argument and the `memory` data location for strings, bytes, arrays and builders. Every call helper returns its receiver's builder type. There are 23 named call operations, 31 overloads, and six permission-encoding utility signatures.

| Receiver        | Type                    | Execution level          | Domain libraries                                                          |
| --------------- | ----------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `vote`          | `VoteCallsBuilder`      | Aragon Voting            | DualGovernanceCalls, EasyTrackCalls, FinanceCalls, PermissionsCalls       |
| `proposalCalls` | `ProposalCallsBuilder`  | DG proposal executor     | AgentCalls                                                                |
| `forwarded`     | `ForwardedCallsBuilder` | Inside one Agent forward | KernelCalls, AllowedRecipientsCalls, PermissionsCalls, NodeOperatorsCalls |

Create each builder with the exact number of its immediate children through `VoteCallsBuilderUtils.create(n)`, `ProposalCallsBuilderUtils.create(n)` or `ForwardedCallsBuilderUtils.create(n)` from `contracts/libraries/calls-builder.sol`. Use the corresponding builder utils for `.getCalls()` and typed `.directCall(...)` where needed. A domain helper appends one call; the two Agent overloads each append one proposal call regardless of how many calls they forward.

One numbered description item is one call of its parent. Preserve separate Agent forwards for separate proposal items; use a grouped forward only when one item explicitly contains several nested calls. Agent forwarding at vote level is unsupported. A target's permission model determines the caller; helpers do not grant access implicitly.

The Solidity snippets are fragments inside `getOmnibusCalls()`. Import the named library from `contracts/libraries/<file>.sol` and attach it with `using <Library> for <ReceiverType>`. All uppercase addresses stand for vote-local named constants with explicit literal values. Declare them in the vote file even when the infrastructure lists contain the same address. Other uppercase inputs are vote constants or locally built parameters. Each snippet's `TITLE` corresponds to the same `title` in its test; domain-specific names such as recipient titles are separate inputs.

The TypeScript snippets run after execution, using `expectedEvents as ev` from `src/omnibuses`. Lowercase contracts are typed handles constructed with the existing `abi/` exports. Lowercase expected values correspond to the Solidity inputs; read public vote constants from `deployment.omnibus` rather than retyping them. Read state-derived inputs at the time specified below. The test describes expectations, not a second list of targets and calldata.

- At vote level, register `voteEvents.item(title, domainEvents)` for every item. Titles are unique, copied from the description without numbering.
- For every DG proposal, register each executor call as `proposalEvents[proposalIndex].call(callIndex, domainEvents)`; indices are zero-based. Proposal calls are addressed by index, not by title.
- For a multi-call Agent forward, pass an array of domain-event arrays, one per nested call. An empty array still occupies that call's position.
- `VoteEvents` automatically checks the Voting `LogScriptCall` and DG submission envelope. `ProposalEvents` automatically checks Agent forwarding and executor envelopes. Do not manually add `LogScriptCall`, Agent `ScriptResult`, `Executed` or the DG submission pair.
- The core checks tail events and rejects leftover logs after both `testVote` and `testProposal`. An omitted item or nested group is a failed check. State assertions are required in addition to events.

The payload comes from `getOmnibusCalls()` and `getEVMScript()` on the deployed vote contract. Item titles are off-chain labels; explicit DG metadata is part of the payload. The runtime verifies the script against those calls before execution and restores its snapshot after testing.

## Agent

Source: `contracts/libraries/Agent.sol`; import `AgentCalls`, attach it to `ProposalCallsBuilder`.

| Signature after `self`                                                | Purpose                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `forward(string title, address agent, address target, bytes payload)` | One typed target call through Agent.                          |
| `forward(string title, address agent, ForwardedCallsBuilder calls)`   | Several explicitly grouped target calls in one Agent forward. |

Single-call pair, using the existing `INodeOperatorsRegistry` interface:

```solidity
proposalCalls.forward(
    TITLE, AGENT, REGISTRY,
    abi.encodeCall(INodeOperatorsRegistry.setNodeOperatorName, (OPERATOR_ID, NEW_NAME))
);
```

```ts
proposal.call(index, ev.nodeOperators.nameSet(registry, { nodeOperatorId, name }));
```

Grouped pair, also attaching `NodeOperatorsCalls` to `ForwardedCallsBuilder`:

```solidity
proposalCalls.forward(
    TITLE, AGENT,
    ForwardedCallsBuilderUtils.create(2)
        .setName(NAME_TITLE, REGISTRY, OPERATOR_ID, NEW_NAME)
        .setRewardAddress(REWARD_TITLE, REGISTRY, OPERATOR_ID, REWARD_ADDRESS)
);
```

```ts
proposal.call(index, [
  ev.nodeOperators.nameSet(registry, { nodeOperatorId, name }),
  ev.nodeOperators.rewardAddressSet(registry, { nodeOperatorId, rewardAddress }),
]);
```

For one forwarded call the flat event array is sufficient. For several calls keep the outer array: spreading the two helpers together loses the call boundaries. For two calls without domain events use `[[], []]`.

The paired structural helper is `ev.agent.forwarded(governance, call, groups)` in `src/omnibuses/expected-events/agent.ts`, invoked by `proposal.call`. It decodes the actual forwarded script, validates its format and group count, and supplies each nested `LogScriptCall` plus the final Agent `ScriptResult`. Author tests use `proposal.call`, not a second direct invocation of this helper.

## Dual Governance

Source: `contracts/libraries/DualGovernance.sol`; import `DualGovernanceCalls`, attach it to `VoteCallsBuilder`.

`submitProposal(string title, string metadata, address governance, ProposalCallsBuilder calls)` appends one top-level submission.

```solidity
vote.submitProposal(TITLE, PROPOSAL_METADATA, DUAL_GOVERNANCE, proposalCalls);
```

```ts
voteEvents.item(title);
```

Extract the metadata using the [single metadata rule in the skill](SKILL.md#building-the-calls) and store it in a vote-local string constant. The helper requires explicit metadata; do not use the builder overload that composes it from call titles. The submission expectation does not test proposal execution: implement `testProposal`, call `passProposals()`, and check every returned proposal call and its state effects.

The paired structural helper is `ev.dualGovernance.proposalSubmitted(governance, { calls, metadata })` in `src/omnibuses/expected-events/dual-governance.ts`. `voteEvents.item` invokes it with calls and metadata decoded from the deployed vote. It checks the Timelock and Dual Governance `ProposalSubmitted` events in order; do not repeat these expectations in the item.

## Kernel

Source: `contracts/libraries/Kernel.sol`; import `KernelCalls`, attach it to `ForwardedCallsBuilder`.

`updateAppImplementation(string title, address kernel, bytes32 appId, address implementation)` calls `IKernel.setApp` in the app-base namespace, `keccak256("base")`.

```solidity
forwarded.updateAppImplementation(TITLE, KERNEL, APP_ID, NEW_IMPLEMENTATION);
```

```ts
proposal.call(index, ev.kernel.appImplementationUpdated(kernel, { appId, implementation }));
```

This event example assumes `forwarded` contains exactly that one call and is wrapped in an Agent forward. The helper checks `SetApp` with the namespace, app ID and implementation. It does not initialize the new implementation or grant Kernel permissions. Resolve those separate actions from the description; verify the old/new app implementation through the Kernel ABI in the test.

## Easy Track

Source: `contracts/libraries/EasyTrack.sol`; import `EasyTrackCalls`, attach it to `VoteCallsBuilder`. Every operation is a direct call by Voting to Easy Track.

| Signature after `self`                                                                                 | Purpose                                                                             |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `addFactory(string title, address easyTrack, address factory, bytes permissions)`                      | Register a factory with an explicit permission list.                                |
| `removeFactory(string title, address easyTrack, address factory)`                                      | Remove a registered factory.                                                        |
| `addTopUpFactory(string title, address easyTrack, address factory, address finance, address registry)` | Register payment and registry-spending permissions, in that order.                  |
| `addRecipientFactory(string title, address easyTrack, address factory, address registry)`              | Register a factory permitted to add a recipient.                                    |
| `removeRecipientFactory(string title, address easyTrack, address factory, address registry)`           | Register a factory permitted to remove a recipient. This does not remove a factory. |

Each row below is an independent Solidity/test pair for one vote item:

| Solidity call                                                          | TypeScript expectation                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `vote.addFactory(TITLE, EASY_TRACK, FACTORY, permissions);`            | `voteEvents.item(title, ev.easyTrack.factoryAdded(easyTrack, { factory, permission }));`              |
| `vote.removeFactory(TITLE, EASY_TRACK, FACTORY);`                      | `voteEvents.item(title, ev.easyTrack.factoryRemoved(easyTrack, { factory }));`                        |
| `vote.addTopUpFactory(TITLE, EASY_TRACK, FACTORY, FINANCE, REGISTRY);` | `voteEvents.item(title, ev.easyTrack.topUpFactoryAdded(easyTrack, { factory, finance, registry }));`  |
| `vote.addRecipientFactory(TITLE, EASY_TRACK, FACTORY, REGISTRY);`      | `voteEvents.item(title, ev.easyTrack.addRecipientFactoryAdded(easyTrack, { factory, registry }));`    |
| `vote.removeRecipientFactory(TITLE, EASY_TRACK, FACTORY, REGISTRY);`   | `voteEvents.item(title, ev.easyTrack.removeRecipientFactoryAdded(easyTrack, { factory, registry }));` |

Here TypeScript `finance` and `registry` are addresses, not contract handles. `factoryAdded` uses the singular input field `permission`. The other registration helpers derive the exact packed permissions from the ABI selectors: Finance `newImmediatePayment` then registry `updateSpentAmount` for top-ups, registry `addRecipient` or `removeRecipient` for the respective factories. They check `EVMScriptFactoryAdded`; removal checks `EVMScriptFactoryRemoved`. Verify registration and stored permissions with `checks.easyTrack` as well.

### Permission encoding

Source: `contracts/libraries/EasyTrackPermissions.sol`; import `EasyTrackPermissionsUtils`, attach it to `bytes` for chaining.

| Signature                                          | Result                                     |
| -------------------------------------------------- | ------------------------------------------ |
| `permission(address target, bytes4 selector)`      | `bytes memory`: start a permission list.   |
| `and(bytes self, address target, bytes4 selector)` | `bytes memory`: append one allowed method. |

Both utilities preserve order and emit no events; their event pair belongs to the consuming `addFactory`. Use interface selectors, never manually packed address/selector bytes. For example, with `IFinance` and `IAllowedRecipientsRegistry` imported:

```solidity
bytes memory permissions = EasyTrackPermissionsUtils
    .permission(FINANCE, IFinance.newImmediatePayment.selector)
    .and(REGISTRY, IAllowedRecipientsRegistry.updateSpentAmount.selector);
vote.addFactory(TITLE, EASY_TRACK, FACTORY, permissions);
```

```ts
voteEvents.item(title, ev.easyTrack.topUpFactoryAdded(easyTrack, { factory, finance, registry }));
```

This is the same permission list that `addTopUpFactory` constructs, so prefer that specialized call when it fits. For a custom list, build the test's expected permission from the specified addresses and ABI-derived selectors, then pass it to `factoryAdded`; do not substitute a permission blob read back from the just-mutated contract for the expected value.

## Allowed recipients

Source: `contracts/libraries/AllowedRecipients.sol`; import `AllowedRecipientsCalls`, attach it to `ForwardedCallsBuilder`.

| Signature after `self`                                                                            | Purpose                                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `setLimitParameters(string title, address registry, uint256 limit, uint256 periodDurationMonths)` | Set a spending limit and its duration in months.          |
| `unsafeSetSpentAmount(string title, address registry, uint256 spentAmount)`                       | Replace the stored spent amount with the specified value. |
| `addRecipient(string title, address registry, address recipient, string recipientTitle)`          | Add a recipient with its registry title.                  |

Each pair assumes one call inside its own Agent forward. For a grouped forward, place each helper result in its own event group instead.

```solidity
forwarded.setLimitParameters(TITLE, REGISTRY, LIMIT, PERIOD_DURATION_MONTHS);
```

```ts
const [, , periodStart] = await client.read(registry, "getPeriodState", []);
proposal.call(
  index,
  ev.allowedRecipients.limitsParametersChanged(registry, {
    limit,
    periodDurationMonths,
    periodStart,
  }),
);
```

This example reads `periodStart` after execution and assumes no later action changes the same registry's period. With several period changes, derive the expectation for each action from its parameters and execution time instead of using the final period for every event. The helper requires `CurrentPeriodAdvanced` before `LimitsParametersChanged`. The limit's units come from the description; months are not seconds. Check the configured limit and period separately against the vote inputs.

```solidity
forwarded.unsafeSetSpentAmount(TITLE, REGISTRY, SPENT_AMOUNT);
```

```ts
proposal.call(
  index,
  ev.allowedRecipients.spentAmountChanged(registry, {
    previousSpentAmount,
    spentAmount,
  }),
);
```

Capture `previousSpentAmount` before execution, accounting for earlier calls to the same registry. The helper expects `SpentAmountChanged` only if the amount changes; equal values produce an empty expectation. Still register the proposal call so its structural events are checked, and verify the resulting spent amount.

```solidity
forwarded.addRecipient(TITLE, REGISTRY, RECIPIENT, RECIPIENT_TITLE);
```

```ts
proposal.call(
  index,
  ev.allowedRecipients.recipientAdded(registry, {
    recipient,
    title: recipientTitle,
  }),
);
```

`recipientTitle` is the text stored for the recipient, not the vote/proposal item title. Verify recipient membership before and after with the registry ABI.

## Finance

Source: `contracts/libraries/Finance.sol`; import `FinanceCalls`, attach it to `VoteCallsBuilder`.

`newImmediatePayment(string title, address finance, address token, address recipient, uint256 amount, string paymentReference)` creates a payment directly as Voting. Amounts are token base units; the reference is an exact payload string.

For an ordinary ERC20:

```solidity
vote.newImmediatePayment(TITLE, FINANCE, TOKEN, RECIPIENT, AMOUNT, PAYMENT_REFERENCE);
```

```ts
voteEvents.item(
  title,
  ev.finance.tokenPaid(
    { finance, vault, token },
    {
      recipient,
      amount,
      reference,
    },
  ),
);
```

For stETH, use the same Solidity helper with the stETH token address and the stETH event pair:

```solidity
vote.newImmediatePayment(TITLE, FINANCE, STETH, RECIPIENT, AMOUNT, PAYMENT_REFERENCE);
```

```ts
voteEvents.item(
  title,
  ev.finance.stethPaid(
    { finance, vault, steth },
    {
      recipient,
      amount,
      reference,
      shares,
    },
  ),
);
```

Here `finance`, `vault`, `token` and `steth` are contract handles. Resolve the paying vault through `Finance.vault`; the event sender is the vault, not Voting. Both event helpers allow zero or more `NewPeriod` events, then require `NewTransaction`, token `Transfer`, and `VaultTransfer`. `stethPaid` additionally requires `TransferShares` between the transfer and vault events.

Capture balances and, for stETH, shares before the payment. Obtain expected transferred `shares` through `getSharesByPooledEth(amount)` at the payment's state; do not use the nominal token amount as a share amount. Check exact share deltas and token balance deltas with the justified stETH rounding tolerance. A preceding action that changes the conversion rate must be accounted for. These pairs cover ERC20 and stETH payments; do not apply them to a native-ETH payment.

## Permissions

Source: `contracts/libraries/Permissions.sol`; import `PermissionsCalls`. Every operation has two overloads with identical arguments after `self`: one for `VoteCallsBuilder`, one for `ForwardedCallsBuilder`, returning the respective builder. Attach the library to both types when the vote needs both routes. There is no `ProposalCallsBuilder` overload; Agent-held rights require a forward inside the DG proposal.

| Signature after `self`                                                                                     | Purpose                                                        |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `createPermission(string title, address acl, address entity, address app, bytes32 role, address manager)`  | Create an Aragon ACL permission and its manager.               |
| `grantPermission(string title, address acl, address entity, address app, bytes32 role)`                    | Grant an Aragon ACL permission without parameters.             |
| `grantPermissionP(string title, address acl, address entity, address app, bytes32 role, uint256[] params)` | Grant an Aragon ACL permission constrained by parameter nodes. |
| `revokePermission(string title, address acl, address entity, address app, bytes32 role)`                   | Revoke an Aragon ACL permission.                               |
| `setPermissionManager(string title, address acl, address manager, address app, bytes32 role)`              | Change the manager of an Aragon ACL permission.                |
| `grantRole(string title, address target, bytes32 role, address account)`                                   | Grant an OpenZeppelin AccessControl role.                      |
| `revokeRole(string title, address target, bytes32 role, address account)`                                  | Revoke an OpenZeppelin AccessControl role.                     |

For each row below, select exactly one Solidity receiver according to the required caller. The two calls show the available overloads, not two actions to put in one vote. The final column is the paired domain-event array `events`.

| Voting call                                                      | Call inside Agent forward                                             | Paired domain events                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `vote.createPermission(TITLE, ACL, ENTITY, APP, ROLE, MANAGER);` | `forwarded.createPermission(TITLE, ACL, ENTITY, APP, ROLE, MANAGER);` | `ev.accessControl.permissionCreated(acl, { entity, app, role, manager })` |
| `vote.grantPermission(TITLE, ACL, ENTITY, APP, ROLE);`           | `forwarded.grantPermission(TITLE, ACL, ENTITY, APP, ROLE);`           | `ev.accessControl.permissionGranted(acl, { entity, app, role })`          |
| `vote.grantPermissionP(TITLE, ACL, ENTITY, APP, ROLE, params);`  | `forwarded.grantPermissionP(TITLE, ACL, ENTITY, APP, ROLE, params);`  | `ev.accessControl.permissionGranted(acl, { entity, app, role, params })`  |
| `vote.revokePermission(TITLE, ACL, ENTITY, APP, ROLE);`          | `forwarded.revokePermission(TITLE, ACL, ENTITY, APP, ROLE);`          | `ev.accessControl.permissionRevoked(acl, { entity, app, role })`          |
| `vote.setPermissionManager(TITLE, ACL, MANAGER, APP, ROLE);`     | `forwarded.setPermissionManager(TITLE, ACL, MANAGER, APP, ROLE);`     | `ev.accessControl.permissionManagerSet(acl, { app, role, manager })`      |
| `vote.grantRole(TITLE, TARGET, ROLE, ACCOUNT);`                  | `forwarded.grantRole(TITLE, TARGET, ROLE, ACCOUNT);`                  | `ev.accessControl.roleGranted(target, { role, to: account, sender })`     |
| `vote.revokeRole(TITLE, TARGET, ROLE, ACCOUNT);`                 | `forwarded.revokeRole(TITLE, TARGET, ROLE, ACCOUNT);`                 | `ev.accessControl.roleRevoked(target, { role, from: account, sender })`   |

Register `voteEvents.item(title, events)` for the Voting route, or `proposal.call(index, events)` for a single-call Agent forward. Multi-call forwards use one group per action as in the Agent section. `app`, `entity` and `manager` in ACL event inputs are addresses; `acl` and the OZ `target` are contract handles.

ACL and OZ are different permission systems. `createPermission` expects `SetPermission` followed by `ChangePermissionManager`; `grantPermissionP` adds `SetPermissionParams` only for a nonempty params array. Its expected hash is derived from the TS nodes, not copied from an emitted log. `setPermissionManager` takes the manager before the app in Solidity. For OZ events, pass the actual `sender` (Voting or Agent); `to` and `from` name the grantee being changed. OZ operations that leave an existing role unchanged may emit no role event: establish the before-state instead of blindly expecting a change.

Use the matching `checks.accessControl` checks. For constrained ACL grants, verify stored parameters and exercise the intended protected call for the intended grantee, with a denied neighbouring argument and denied caller. Newly granted rights should fail before the vote; a renewal of an existing grant has a different before-state and must not pretend otherwise. Temporary permission-use probes belong inside a snapshot.

### ACL parameter encoding

Source: `contracts/libraries/AclPermissions.sol`; import `AclPermissionsUtils`. `Op` below means `AclPermissionsUtils.Op`.

| Signature                                                  | Purpose                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `param(uint8 argId, Op op, uint240 value)`                 | Encode a comparison/value node.                              |
| `param(uint8 argId, Op op, address value)`                 | Encode a node with an address value.                         |
| `ifElse(uint32 condition, uint32 success, uint32 failure)` | Branch by indices into the params array.                     |
| `logic(Op op, uint32 left, uint32 right)`                  | Combine nodes with AND, OR, XOR or NOT; NOT ignores `right`. |

Each returns `uint256`; the utilities do not append a call or emit events. Their consumer is `grantPermissionP`, whose TS event input is an `AclParam[]`, not the encoded Solidity `uint256[]`. Import `aclParam`, `aclIfElse` and `AclOp` from `src/omnibuses`; import `LOGIC_OP_PARAM_ID` from `src/omnibuses/acl-permission-params` for logic nodes.

Corresponding Solidity and TS nodes, with values and indices supplied by the description:

| Solidity node                                                                   | TypeScript node                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, uint240(OPERATOR_ID))` | `aclParam(0, AclOp.EQ, nodeOperatorId)`                     |
| `AclPermissionsUtils.param(1, AclPermissionsUtils.Op.EQ, ACCOUNT)`              | `aclParam(1, AclOp.EQ, account)`                            |
| `AclPermissionsUtils.ifElse(1, 2, 3)`                                           | `aclIfElse(1, 2, 3)`                                        |
| `AclPermissionsUtils.logic(AclPermissionsUtils.Op.AND, 1, 2)`                   | `aclParam(LOGIC_OP_PARAM_ID, AclOp.AND, 1n \| (2n << 32n))` |

There is no `aclLogic` export. For a logic node, represent its two indices in the `aclParam` value as shown. The example indices require nodes at those positions; they are not a complete permission by themselves. Preserve the description's tree, operator and index order. Numeric values must fit `uint240` before conversion.

A complete single-node grant pair:

```solidity
uint256[] memory params = new uint256[](1);
params[0] = AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, uint240(OPERATOR_ID));
forwarded.grantPermissionP(TITLE, ACL, ENTITY, APP, ROLE, params);
```

```ts
const params = [aclParam(0, AclOp.EQ, nodeOperatorId)];
proposal.call(index, ev.accessControl.permissionGranted(acl, { entity, app, role, params }));
await checks.accessControl.checkAragonPermissionParams({
  contracts: { acl },
  entity,
  app,
  role,
  params,
});
```

Use the same consuming call/event pattern for the address, if/else and logic nodes above, keeping every node in its declared position. The allowed logical operators and special parameter IDs come from the library, not recalled enum values.

## Node operators

Source: `contracts/libraries/NodeOperators.sol`; import `NodeOperatorsCalls`, attach it to `ForwardedCallsBuilder`.

| Signature after `self`                                                                                                                                             | Purpose                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `setName(string title, address registry, uint256 nodeOperatorId, string name)`                                                                                     | Rename a node operator on its registry.                        |
| `setRewardAddress(string title, address registry, uint256 nodeOperatorId, address rewardAddress)`                                                                  | Change an operator's reward recipient.                         |
| `deactivate(string title, address registry, uint256 nodeOperatorId)`                                                                                               | Deactivate an active operator.                                 |
| `updateTargetValidatorsLimits(string title, address stakingRouter, uint256 stakingModuleId, uint256 nodeOperatorId, uint256 targetLimitMode, uint256 targetLimit)` | Update a module operator's target limit through StakingRouter. |

Each pair below assumes its own single-call Agent forward. Keep separate description items as separate forwards even if they target the same registry.

```solidity
forwarded.setName(TITLE, REGISTRY, OPERATOR_ID, NEW_NAME);
```

```ts
proposal.call(index, ev.nodeOperators.nameSet(registry, { nodeOperatorId, name }));
```

```solidity
forwarded.setRewardAddress(TITLE, REGISTRY, OPERATOR_ID, REWARD_ADDRESS);
```

```ts
proposal.call(index, ev.nodeOperators.rewardAddressSet(registry, { nodeOperatorId, rewardAddress }));
```

```solidity
forwarded.deactivate(TITLE, REGISTRY, OPERATOR_ID);
```

```ts
proposal.call(
  index,
  ev.nodeOperators.activeSet(registry, {
    nodeOperatorId,
    active: false,
    nonce: nonceBefore + 1n,
    vettedSigningKeysCount: vettedBefore > depositedBefore ? depositedBefore : undefined,
  }),
);
```

Read the nonce and operator key counts before execution. Deactivation emits `NodeOperatorActiveSet`, optionally resets vetted keys down to deposited keys, then emits both `KeysOpIndexSet` and `NonceChanged`. The optional event is controlled by the supplied `vettedSigningKeysCount`; supply the reset value exactly when the prior vetted count exceeds the deposited count. Check the active flag, active-operator count and vetted count after execution.

```solidity
forwarded.updateTargetValidatorsLimits(
    TITLE, STAKING_ROUTER, MODULE_ID, OPERATOR_ID, TARGET_LIMIT_MODE, TARGET_LIMIT
);
```

```ts
proposal.call(
  index,
  ev.nodeOperators.targetValidatorsCountChanged(registry, {
    nodeOperatorId,
    targetValidatorsCount: targetLimitMode === 0n ? 0n : targetLimit,
    targetLimitMode,
    nonce: nonceBefore + 1n,
  }),
);
```

The target-limits call goes to StakingRouter, but its expected events come from the node-operator registry resolved by the module ID. The helper requires `TargetValidatorsCountChanged`, `KeysOpIndexSet` and `NonceChanged`; for the curated NodeOperatorsRegistry, mode `0` disables the target limit and normalizes the stored and emitted count to `0`, even if the call supplies a nonzero `targetLimit`. For nonzero modes, expect the supplied `targetLimit`, as shown above. Mode numbers must come from the description or repository. Check the module-to-registry mapping and the resulting operator target settings with `checks.stakingRouter`.

Both nonce examples assume no earlier action has incremented this registry's nonce. For a sequence, advance the expected nonce in execution order; for example a target-limit update followed by deactivation expects `nonceBefore + 1n`, then `nonceBefore + 2n`. Name and reward-address changes use their own event helpers without nonce events. State checks should preserve the expected effect of every action rather than hardcode a historical nonce.
