# 👷🏼 Depot

The purpose of this repo is to build, test and run omnibuses.

## Omnibus

The main purpose of the omnibus is to prepare the EVM script that will be executed if the vote is successful. The voting EVM script is built from the omnibus items defined in the omnibus. During the run, the omnibus will call the

```
newVote(bytes executionScript, string metadata, bool castVote, bool executesIfDecided)
```

[function of the voting contract](https://github.com/aragon/aragon-apps/blob/b72da2c6606a361d0160d5d78fb534018ba3ce91/apps/voting/contracts/Voting.sol#L138) with the prepared script and description.

## Omnibus Item

Each omnibus is made up of items. An omnibus item is the basic building block of each omnibus. It represents a single on-chain action (such as changing protocol settings, granting or revoking access, transferring tokens, etc). In code, it is represented as an object containing

- `title` - arbitrary name of the current item
- `evmCall` - EVM call script for this item, which is added to the entire voting script and executed after voting is enacted. Call encoding funtion can be found [here](https://github.com/lidofinance/depot/blob/811b1df686e935e2df71c1ed5168271afc6e6874/src/votes/vote-script.ts#L105)
- `expectedEvents` - expected on-chain events that should be fired after the vote is executed (used as a means of self-verification procedure)

```typescript
interface OmnibusItem {
  title: string;
  evmCall: FormattedEvmCall;
  expectedEvents: EventCheck[];
}
```

## Keystores

Keystores allow you to securely store your private keys and use them in the process of running omnibuses.

## Installation

0. Due to proper work of all Depot features like simulating, testing, etc you have to have running [local hardhat node](https://github.com/lidofinance/hardhat-node)
1. Clone the repo
2. Install dependencies via `pnpm install`
3. Types will be generated automatically via postinstall script
4. Seed the `.env` file from the `.env.example`

## Writing omnibuses

You need to create a new file in the [omnibuses](./src/omnibuses) folder.
Naming convention is to name omnibuses `${YYYY_MM_DD}.ts`.

Writing an omnibus essentially means packing a bunch of omnibus items into an `omnibuses.create` call along with the additional parametres:

- `network` - one of the allowed network names. At the moment it's `mainnet` and `goerly`

and exporting the result as the default export of a module.

### Writing Omnibus Items

Omnibus Item can be written in two ways:

1. Use predefined blueprints. You can find all available blueprints in the [blueprints](./src/omnibuses/blueprints) folder. You can also write your own blueprints: [Writing Omnibus Blueprints](src/omnibuses/blueprints/README.md).
2. Write the item from scratch following the interface above.

### Omnibus example

Using blueprints:

```typescript
export default omnibuses.create({
  network: "mainnet",
  items: ({ blueprints, contracts }) => [
    blueprints.tokens.transferLDO({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
      amount: 180_000n * 10n ** 18n,
    }),
  ],
});
```

Writing item by scratch:

```typescript
export default omnibuses.create({
  network: "mainnet",
  items: ({ contracts }) => [
    {
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      evmCall: call(contracts.finance.newImmediatePayment, [
        contracts.ldo,
        "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
        180_000n * 10n ** 18n,
        "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      ]),
      expectedEvents: [
        event(contracts.callsScript, "LogScriptCall", { emitter: contracts.voting }),
        event(contracts.finance, "NewPeriod", undefined, { optional: true }),
        event(contracts.finance, "NewTransaction", {
          args: [
            undefined,
            false,
            "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
            180_000n * 10n ** 18n,
            "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
          ],
        }),
        event(contracts.ldo, "Transfer", {
          args: [contracts.agent, "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", 180_000n * 10n ** 18n],
        }),
        event(contracts.agent, "VaultTransfer", {
          args: [contracts.ldo, "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", 180_000n * 10n ** 18n],
        }),
      ],
    },
  ],
});
```

:::info
The two examples above are equivalent. The first one uses blueprint [transferLDO](src/omnibuses/blueprints/tokens.ts)
and the second one uses custom item with the same logic.
:::

You can find the detailed example of the omnibus in this [file](./omnibuses/_example_omnibus.ts).

## Testing omnibus

Each omnibus MUST be thoroughly tested before running on the mainnet.

### Writing tests

To test an omnibus you need to create a new file in the [omnibuses](./omnibuses) folder with the same name as the omnibus file but with the `.spec.ts` extension. You can find the detailed example in this [file](./omnibuses/_example_omnibus.spec.ts).

Basic test structure:

```typescript
describe("Testing --OMNIBUS_NAME--", () => {
  let enactReceipt: Receipt;
  let snapshotId: string;

  // Take snapshot and revert it after all tests for the local runs.
  before(async () => {
    snapshotId = await provider.send("evm_snapshot", []);
  });

  after(async () => {
    await provider.send("evm_revert", [snapshotId]);
  });

  // Test suites
  // Pre-flight checks
  describe("Check network state before voting...", () => {
    it("Do some pre-flight checks", async () => {
      // Do some pre-flight checks.
    });
  });

  // Enact omnibus and check network state after voting
  describe("Enact omnibus and check network state after voting...", () => {
    // Set any variables you need to check after the omnibus is enacted.
    // let someVariable: any;

    before(async () => {
      // Do some before run requests.

      // Start and enact omnibus. Keep receipt to check events.
      enactReceipt = await enactOmnibus(omnibus, provider);
      console.log("    Omnibus enacted successfully. Running checks...");
    });

    describe("Checks for the first action", () => {
      it("Do some post-run checks", async () => {
        // Do some post-run checks.
      });
    });
  });

  // Check fired events
  describe("Check fired events...", () => {
    it("All expected events were fired", () => {
      events.checkOmnibusEvents(omnibus.items, enactReceipt);
    });
  });
});
```

To improve readability you can group tests in suites by the logic (check the example above).

### Predefined checks

There are some predefined checks that you can use in your tests. You can find them in the [checks](./src/omnibuses/checks) folder. You're free to use the predefined checks as well as the custom ones.

Read more about checks [here](./src/omnibuses/checks/README.md).

### Check fired events

If omnibus items were written correctly, you shouldn't do anything for the events check, it will be done automatically. If item is built from the blueprint, all expected events are already listed in the blueprint.

:::warning
All expected events MUST be defined in the omnibus items. If there will be any
unexpected events, the test will fail. If the event was described in the omnibus actions, but wasn't fired, the test will fail too.
:::

### Running tests

To run omnibus test you should run the following command:

```bash
pnpm omnibus:test ${OMNIBUS_NAME}
```

Where `${OMNIBUS_NAME}` is the name of the file in the [omnibuses](./omnibuses) folder without `.ts` extension.

## Keystores

To run omnibus you need to have a keystore with the private key. To set it up you have
to run the following command:

```bash
pnpm ks:add ${KEYSTORE_NAME}
```

Where `${KEYSTORE_NAME}` can be anything you're comfortable with.

To list all available keystores you can run the following command:

```bash
pnpm ks:ls
```

To remove keystore you can run the following command:

```bash
pnpm ks:del ${KEYSTORE_NAME}
```

To generate a new keystore you can run the following command:

```bash
pnpm ks:gen ${KEYSTORE_NAME}
```

To change the keystore password you can run the following command:

```bash
pnpm ks:pwd ${KEYSTORE_NAME}
```

## Run omnibus

To run omnibus you need to run the following command:

```bash
pnpm omnibus:run ${OMNIBUS_NAME}
```

Where `${OMNIBUS_NAME}` is the name of the file in the [omnibuses](./src/omnibuses) folder without `.ts` extension. While the script is running, it should print all calls made to the network and ask for your confirmation to continue. After deployment, you should see the following message:

```
Omnibus successfully launched 🎉!
Details:
    Vote ID: 000
    Block number: 12345678
    Launch date: 01 Jan 1970
```

You have to set vote ID in the omnibus file. Also, you can add launch date to the comments if it looks relevant.

# Project structure

This project is structured as follows:

- [archive](./archive) - Old omnibuses and tests
- [configs](./configs) - Lido deployed contracts addresses and related types
- [interfaces](./interfaces) - ABI's of Lido contracts
- [omnibuses](./omnibuses) - Actual omnibuses
- [src](./src) - Source code:
  - [common](./src/common) - Common utils and helpers
  - [contract-info-resolver](./src/contract-info-resolver) - Contract info resolver. Used to get contracts info from Etherscan
  - [contracts](./src/contracts) - Contracts helpers
  - [hardhat-keystores](./src/hardhat-keystores) - Keystores helpers
  - [lido](./src/lido) - Lido contracts
  - [omnibuses](./src/omnibuses) - Collection of omnibus related stuff - blueprints, checks, tools and structures.
    - [blueprints](./src/omnibuses/blueprints) - Omnibus blueprints
    - [checks](./src/omnibuses/checks) - Omnibus checks
    - [tools](./src/omnibuses/tools) - Omnibus tools and helpers
  - [providers](./src/providers) - Helpers for working with providers
  - [traces](./src/traces) - Transaction tracing toolset
  - [votes](./src/votes) - Voting toolset
- [tasks](./tasks) - Omnibuses Hardhat tasks. Main entrypoint for running omnibuses.
