# Omnibus helper catalogue

Use this catalogue when an action matches one of these domains. Resolve its caller, arguments and state assumptions before choosing a helper; [the writing guide](../../../docs/omnibuses/WRITING_OMNIBUS.md) owns the common metadata and test lifecycle rules. Linked implementations are the source for full signatures and overloads.

## Builder levels

Import types and matching `*BuilderUtils` from [calls-builder.sol](../../../contracts/libraries/calls-builder.sol). `create(n)` allocates immediate children; `getCalls()` completes that builder. Domain call helpers return the same builder for chaining.

| Receiver                | Caller at the target                   | Available operations                                                                                    |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `VoteCallsBuilder`      | Aragon Voting                          | `directCall`, explicit-metadata `submitCalls`; Finance, EasyTrack, Permissions, DualGovernance helpers. |
| `ProposalCallsBuilder`  | DG proposal executor, unless forwarded | `directCall`, `directCallWithValue`, `executeCall`, `forwardCall`, `forwardCalls`; Agent helpers.       |
| `ForwardedCallsBuilder` | Agent inside one forward               | `directCall`; Kernel, AllowedRecipients, Permissions, NodeOperators helpers.                            |

Use `abi.encodeCall(IContract.method, (...))` for direct payloads. For value-bearing proposal calls, distinguish `directCallWithValue` (executor sends value directly) from `executeCall` (calls the chosen executor/Agent's `execute(target, value, payload)`). The target's permissions and funding determine the route.

In TS, import `expectedEvents as ev` from `src/omnibuses`. Pass typed contract handles to domain event helpers unless a field explicitly takes an address. Register their returned arrays with `voteEvents.item(title, events)` or `proposal.call(index, events)`; titles are vote-level keys, proposal indices are zero-based. Envelope/tail checks belong to the runtime, not a duplicate event list.

## Agent and Dual Governance

[AgentCalls](../../../contracts/libraries/Agent.sol) extends `ProposalCallsBuilder`:

- `forward(title, agent, target, payload)` adds one Agent forward containing one target call.
- `forward(title, agent, forwardedBuilder)` adds one forward containing that builder's calls. It retains their ordered nested titles.

[DualGovernanceCalls](../../../contracts/libraries/DualGovernance.sol) extends `VoteCallsBuilder` with `submitProposal(title, metadata, governance, proposalBuilder)`. Supply explicit metadata using the guide's exact fenced-text rule; the metadata-generating `submitCalls` overload is not the authoring path.

For one forwarded call, a flat domain-event array is sufficient. For several forwarded calls, preserve one array per child, including empty arrays. For example, after `passProposals()`, a two-call NodeOperators forward is checked as follows (variables are the specified vote inputs/typed handles):

```ts
proposal.call(index, [
  ev.nodeOperators.nameSet(registry, { nodeOperatorId, name }),
  ev.nodeOperators.rewardAddressSet(registry, { nodeOperatorId, rewardAddress }),
]);
```

For two children with no domain events use `[[], []]`; spreading two helpers into one flat array loses their boundaries. Separate numbered proposal items remain separate forwards unless the description explicitly groups them.

`voteEvents.item(title)` checks the Voting/DG submission envelope. `proposal.call` supplies the executor and Agent-forward envelopes. The underlying `ev.agent.forwarded` assumes a **DG proposal executed through AdminExecutor**; it is not a generic Voting-forward helper. Do not invoke it again around a `proposal.call` expectation.

For a full example with metadata and authority checks, see [Agent / DG / Kernel](../../../omnibuses/_example_agent_dg_kernel_omnibus).

## Kernel

[KernelCalls](../../../contracts/libraries/Kernel.sol) extends `ForwardedCallsBuilder` with `updateAppImplementation(title, kernel, appId, implementation)`. It calls `IKernel.setApp` in `keccak256("base")`, not the app-address namespace.

Pair it with `ev.kernel.appImplementationUpdated(kernel, { appId, implementation })`. Check the old/new app implementation through the Kernel ABI. The wrapper neither initializes the implementation nor grants Kernel permissions; include those actions only when required by the description.

## Easy Track

[EasyTrackCalls](../../../contracts/libraries/EasyTrack.sol) extends `VoteCallsBuilder`. All calls below execute directly as Voting; TS event helpers live in [easy-track.ts](../../../src/omnibuses/expected-events/easy-track.ts).

| Call helper                                                     | Domain event helper and input                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `addFactory(title, easyTrack, factory, permissions)`            | `ev.easyTrack.factoryAdded(easyTrack, { factory, permission })`              |
| `removeFactory(title, easyTrack, factory)`                      | `ev.easyTrack.factoryRemoved(easyTrack, { factory })`                        |
| `addTopUpFactory(title, easyTrack, factory, finance, registry)` | `ev.easyTrack.topUpFactoryAdded(easyTrack, { factory, finance, registry })`  |
| `addRecipientFactory(title, easyTrack, factory, registry)`      | `ev.easyTrack.addRecipientFactoryAdded(easyTrack, { factory, registry })`    |
| `removeRecipientFactory(title, easyTrack, factory, registry)`   | `ev.easyTrack.removeRecipientFactoryAdded(easyTrack, { factory, registry })` |

`removeRecipientFactory` registers a factory permitted to remove recipients; it does **not** remove a factory. `factoryAdded` takes singular `permission`. The `finance` and `registry` TS fields are addresses; `easyTrack` is a contract handle. Verify stored registration and permissions using bound `checks.easyTrack` as well.

[EasyTrackPermissionsUtils](../../../contracts/libraries/EasyTrackPermissions.sol) builds ordered permission bytes with `permission(target, IContract.method.selector)` and `.and(target, selector)`. Prefer the specialized top-up/recipient helpers when they fit. Top-up permissions are Finance `newImmediatePayment`, then registry `updateSpentAmount`. Test a custom list against the specified address/selector pairs, not a blob read from the just-mutated registry.

## Allowed recipients

[AllowedRecipientsCalls](../../../contracts/libraries/AllowedRecipients.sol) extends `ForwardedCallsBuilder`. Pair each call with [allowed-recipient events](../../../src/omnibuses/expected-events/allowed-recipients.ts):

| Call helper                                                        | Domain event helper and input                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `setLimitParameters(title, registry, limit, periodDurationMonths)` | `ev.allowedRecipients.limitsParametersChanged(registry, { limit, periodDurationMonths, periodStart })` |
| `unsafeSetSpentAmount(title, registry, spentAmount)`               | `ev.allowedRecipients.spentAmountChanged(registry, { previousSpentAmount, spentAmount })`              |
| `addRecipient(title, registry, recipient, recipientTitle)`         | `ev.allowedRecipients.recipientAdded(registry, { recipient, title: recipientTitle })`                  |

The TS `registry` is a contract handle. A recipient's stored title is distinct from the vote/proposal call title. Limit duration is in months; amount units come from the description.

Capture the previous spent amount before execution, accounting for earlier calls. Equal old/new spent amounts produce no domain event, but the proposal call still needs registration. Limit changes expect `CurrentPeriodAdvanced` before `LimitsParametersChanged`; derive the period for that action rather than blindly using final state after multiple period changes. Check stored limits, period, spent amount and recipient membership against the intended inputs.

Paired unit examples: [AllowedRecipients.t.sol](../../../contracts/libraries/AllowedRecipients.t.sol) and [event tests](../../../test/omnibuses/expected-events-allowed-recipients.unit.test.ts).

## Finance

[FinanceCalls](../../../contracts/libraries/Finance.sol) extends `VoteCallsBuilder` with `newImmediatePayment(title, finance, token, recipient, amount, paymentReference)`. The reference is an exact payload string; amounts use token base units.

For an ERC20, register:

```ts
voteEvents.item(title, ev.finance.tokenPaid({ finance, vault, token }, { recipient, amount, reference }));
```

For stETH use `ev.finance.stethPaid({ finance, vault, steth }, { recipient, amount, reference, shares })`. These inputs are contract handles. Resolve the paying vault through Finance; it is the token-event sender, not Voting. The helpers allow optional repeated `NewPeriod`, then validate payment/transfer/vault events, with `TransferShares` added for stETH.

Read balances and shares before the payment. Determine `shares` using `getSharesByPooledEth(amount)` at the payment's state, accounting for earlier rate-changing actions. Assert exact share deltas and justified token rounding tolerance. These ERC20/stETH helpers do not describe a native-ETH payment. See [the tiny example](../../../omnibuses/_example_tiny_omnibus) and [Finance example](../../../omnibuses/_example_finance_omnibus).

## Permissions

[PermissionsCalls](../../../contracts/libraries/Permissions.sol) supports both `VoteCallsBuilder` and `ForwardedCallsBuilder`, with identical arguments after the receiver. Choose Voting or Agent authority; there is no direct `ProposalCallsBuilder` domain overload.

| Call helper                                                | Domain event helper and input                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `createPermission(title, acl, entity, app, role, manager)` | `ev.accessControl.permissionCreated(acl, { entity, app, role, manager })` |
| `grantPermission(title, acl, entity, app, role)`           | `ev.accessControl.permissionGranted(acl, { entity, app, role })`          |
| `grantPermissionP(title, acl, entity, app, role, params)`  | `ev.accessControl.permissionGranted(acl, { entity, app, role, params })`  |
| `revokePermission(title, acl, entity, app, role)`          | `ev.accessControl.permissionRevoked(acl, { entity, app, role })`          |
| `setPermissionManager(title, acl, manager, app, role)`     | `ev.accessControl.permissionManagerSet(acl, { app, role, manager })`      |
| `grantRole(title, target, role, account)`                  | `ev.accessControl.roleGranted(target, { role, to: account, sender })`     |
| `revokeRole(title, target, role, account)`                 | `ev.accessControl.roleRevoked(target, { role, from: account, sender })`   |

TS `acl` and OZ `target` are contract handles; entity/app/manager are addresses. `setPermissionManager` takes manager before app in Solidity. OZ `sender` is the actual caller (Voting or Agent); unchanged membership may emit no role event. Establish the before-state before expecting a grant/revoke event.

For Aragon ACL, `createPermission` checks permission and manager events, while nonempty parameterized grants also require `SetPermissionParams`. Use bound `checks.accessControl` to verify roles, managers and stored parameters. A relevant allowed/denied protected call checks the meaning of a grant beyond its storage/events.

### ACL parameter encoding

Use [AclPermissionsUtils](../../../contracts/libraries/AclPermissions.sol): `param(uint8 argId, Op op, uint240 value)` or its address overload, `ifElse(uint32 condition, uint32 success, uint32 failure)`, and `logic(Op op, uint32 left, uint32 right)`. These return encoded nodes; they do not append calls.

The TS expectations use structured nodes from `src/omnibuses`:

| Solidity node                                                                   | TS node                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, uint240(OPERATOR_ID))` | `aclParam(0, AclOp.EQ, nodeOperatorId)`                     |
| `AclPermissionsUtils.param(1, AclPermissionsUtils.Op.EQ, ACCOUNT)`              | `aclParam(1, AclOp.EQ, account)`                            |
| `AclPermissionsUtils.ifElse(1, 2, 3)`                                           | `aclIfElse(1, 2, 3)`                                        |
| `AclPermissionsUtils.logic(AclPermissionsUtils.Op.AND, 1, 2)`                   | `aclParam(LOGIC_OP_PARAM_ID, AclOp.AND, 1n \| (2n << 32n))` |

Import `LOGIC_OP_PARAM_ID` from `src/omnibuses/acl-permission-params`; there is no `aclLogic` export. Logic nodes need the correct special ID as well as operator/index values. Referenced nodes must exist in the array, and ordering changes the permission. The encoder mirrors Solidity widths/masking rather than providing range validation; confirm intended values before explicit casts.

Pass the same structured `params` to `ev.accessControl.permissionGranted` and the bound check:

```ts
await checks.accessControl.checkAragonPermissionParams({ contracts: { acl }, entity, app, role, params });
```

The storage check compares all decoded node fields. See the complete grant and permission-use test in [Permissions / Node operators](../../../omnibuses/_example_permissions_node_operators).

## Node operators

[NodeOperatorsCalls](../../../contracts/libraries/NodeOperators.sol) extends `ForwardedCallsBuilder`; event helpers use the node-operator registry handle:

| Call helper                                                                                                         | Domain event helper and input                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `setName(title, registry, nodeOperatorId, name)`                                                                    | `ev.nodeOperators.nameSet(registry, { nodeOperatorId, name })`                                                               |
| `setRewardAddress(title, registry, nodeOperatorId, rewardAddress)`                                                  | `ev.nodeOperators.rewardAddressSet(registry, { nodeOperatorId, rewardAddress })`                                             |
| `deactivate(title, registry, nodeOperatorId)`                                                                       | `ev.nodeOperators.activeSet(registry, { nodeOperatorId, active: false, nonce, vettedSigningKeysCount })`                     |
| `updateTargetValidatorsLimits(title, stakingRouter, stakingModuleId, nodeOperatorId, targetLimitMode, targetLimit)` | `ev.nodeOperators.targetValidatorsCountChanged(registry, { nodeOperatorId, targetValidatorsCount, targetLimitMode, nonce })` |

For deactivation, read key counts and nonce before execution. Supply `vettedSigningKeysCount` only when vetted keys exceed deposited keys, using the deposited count as the reset value; otherwise use `undefined`. The helper also expects `KeysOpIndexSet` and `NonceChanged`.

Target-limit calls go to StakingRouter but emit from the module's registry. Confirm that mapping. For the curated registry, disabled mode `0` emits/stores count `0`; other modes use the specified limit. Both target-limit updates and deactivation increment nonce; account for earlier increments in execution order. Name/reward-address helpers have no nonce events. Verify active status and target settings with bound `checks.stakingRouter`; read key counts directly through the registry ABI.

## Other domain events

For typed direct calls without a wrapper, use the existing helpers in [expected-events](../../../src/omnibuses/expected-events): `proxy`, `hashConsensus`, `stakingRouter` and the namespaces above. Match their exact arguments and emitter to the target ABI; fall back to `event(contract, eventName, args)` when the action has no domain helper. This adds expectations to the existing runtime, not a new call builder in TypeScript.
