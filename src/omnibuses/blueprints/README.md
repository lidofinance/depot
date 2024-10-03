# Writing blueprint

Blueprint should be a function that accepts Lido contracts as a first param and typed input as a second
and return an object or an array of objects that satisfy the `OmnibusItem` interface.

```typescript
function myItemBlueprint(contracts: Contracts<Lido>, input: MyItemInput): OmnibusItem | OmnibusItem[] {
  // item logic
}
```

The resulting `Item` object MUST satisfy the `OmnibusItem` interface:

```typescript
interface OmnibusItem {
  title: string;
  evmCall: FormattedEvmCall;
  expectedEvents: EventCheck[];
}
```

#### Example

```typescript
// actions/someNameSpace.ts
interface MyInput {
  title: string;
  to: Address;
  amount: BigNumberish;
}

function myBlueprint(contracts: Contracts<Lido>, input: MyInput): OmnibusItem {
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

export default {
  myBlueprint,
};
```

Don't forget to reexport your blueprints in the `index.ts` file.

```typescript
import someNameSpace from "./someNameSpace";

export default {
  someNameSpace,
};
```

## Usage

Blueprint written in this way can be used in the omnibus like this:

```typescript
export default omnibuses.create({
  network: "mainnet",
  quorumReached: false,
  items: ({ blueprints, contracts }) => [
    blueprints.someNameSpace.myBlueprint({
      title: "My item title",
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
      amount: 180_000n * 10n ** 18n,
    }),
  ],
});
```

## Testing blueprint
