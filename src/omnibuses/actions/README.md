# Writing Omnibus Actions 101

## What is an omnibus action?

An `Action` is a logical part of an omnibus that provides single EVM call. These calls are composed into an EVM script, which is executed if the omnibus reaches the quorum.
An `Action` MUST satisfy the `OmnibusAction` interface:

```typescript
interface OmnibusAction {
  title: string;
  evmCall: FormattedEvmCall;
  expectedEvents: EventCheck[];
}
```

Action maker function can return either single `OmnibusAction` or an array of `OmnibusAction` objects.

## `Action` structure

Action should be a function that accepts contracts as a first param and input as a second and return an object or an array of objects.

Example

```typescript
interface MyActionInput {
  title: string;
  to: Address;
  amount: BigNumberish;
}

function myAction(contracts: Contracts<Lido>, input: MyActionInput): OmnibusAction {
  const { agent, finance, callsScript, voting } = contracts; // contracts that are used in the action
  const { to, amount, title } = input; // input that is passed to the action

  return {
    title: title, // title of the action that will be added in omnbibus description
    evmCall: call(someContract.someMethod, [methodArg1, methodArg2]), // call that will be added to the omnibus script
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }), // callScript event will be fired in the each action
      event(anotherContract, "anotherMethod", { args: [agent, to, amount] }), // required event with args
      event(anotherContract, "anotherMethod1", undefined), // required event without args
      event(someContract, "someMethod", undefined, { optional: true }), // optional event without args
    ],
  };
}
```
