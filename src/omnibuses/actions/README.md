# Writing Omnibus Actions 101

## What is an omnibus action?

An `Action` is a logical part of an omnibus that provides one or more EVM calls. These calls are composed into an EVM script, which is executed if the omnibus reaches the quorum.

An `Action` can contain:

- A single EVM call, for example [TransferAssets](./transfer-assets.ts)
- Multiple similar calls, for example [AddNodeOperators](./add-node-operators.ts)
- Multiple different calls, for example [AddPaymentEvmScriptFactories](./add-payment-evm-script-factories.ts)

If an `Action` contains multiple calls, they should be united by the same business logic.

An `Action` should be able to test the changes it made by itself. It should have tests written in `before` and `after` methods.

Additionally, an `Action` must have a `title` field in its input or a `title` getter method which returns an action title.

## `Action` structure

Action template for action with static title:

```typescript
interface ExampleInput extends OmnibusActionInput {
  title: string;
  requiredField: string;
  optionalField?: number;
}

export class ExampleAction extends OmnibusAction<ExampleInput> {
  getEVMCalls(): FormattedEvmCall[] {}

  getExpectedEvents(): EventCheck[] {}

  async before({ assert, provider }: OmnibusHookCtx): Promise<void> {}

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {}
}
```

Action template for action with dynamic title:

```typescript
interface ExampleInput extends OmnibusActionInput {
  requiredField: string;
  optionalField?: number;
}

export class ExampleAction extends OmnibusAction<ExampleInput> {
  get title(): string {
    return `ExampleAction: ${this.input.requiredField}`;
  }

  getEVMCalls(): FormattedEvmCall[] {}

  getExpectedEvents(): EventCheck[] {}

  async before({ assert, provider }: OmnibusHookCtx): Promise<void> {}

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {}
}
```
