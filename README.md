# 👷🏼 Depot

The purpose of this repo is to build, test and run omnibuses.

---

## Vocabulary

### Omnibus

Omnibus is a collection of actions that are supposed to be executed after the vote.

### Action

Action is a base brick of each omnibus.
It is single task like changing protocol settings, granting/revoking access, transferring tokens, etc.
You can find all available actions in the [actions](./src/omnibuses/actions) folder.

#### Writing actions

[Writing Omnibus Actions 101](./src/omnibuses/actions/README.md)

### Keystores

Keystores allow you to store your private keys in a secure way.

---

## Installation

1. Clone the repo
2. Install dependencies via `pnpm install`
3. types will be generated automatically via postinstall script
4. Seed the `.env` file from the `.env.example`

---

## Writing omnibuses

As it was mentioned before, omnibus is a collection of actions, so you need to create a new file in the [omnibuses](./src/omnibuses) folder.
Naming convention is to name omnibuses `${YYYY_MM_DD}.ts`.

Omnibus example:

```typescript
export default omnibuses.create({
  network: "mainnet",
  quorumReached: false,
  items: ({ actions, contracts }) => [
    actions.tokens.transferLDO({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
      amount: 180_000n * 10n ** 18n,
    }),
  ],
});
```

You can use as predefined actions as the custom ones:

```typescript
export default omnibuses.create({
  network: "mainnet",
  quorumReached: false,
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

The two examples above are equivalent. The first one uses predefined action [transferLDO](./src/omnibuses/actions/tokens.ts) and the second one uses custom action with the same logic.

Detailed example of omnibus you can find in the [file](./omnibuses/_demo_omnibus.ts).

---

## Testing omnibus

Each omnibus should be thoroughly tested before running on the mainnet.

### Writing tests

To test it you need to create a new file in the [omnibuses](./src/omnibuses) folder with the same name as the omnibus file with `_spec` suffix.

[Example](./omnibuses/_demo_omnibus.spec.ts).

Base test structure:

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
      events.checkOmnibusEvents(omnibus.actions, enactReceipt);
    });
  });
});
```

To improve readability you can group tests in suites by the actions logic (check the example above).

### Predefined checks

There are some predefined checks that you can use in your tests. You can find them in the [checks](./src/omnibuses/checks) folder.
You're free to use as predefined checks as the custom ones.

Read more about checks [here](./src/omnibuses/checks/README.md).

### Check fired events

If omnibus actions were written correctly, you shouldn't do anything for the events check, it will be done
automatically.

> All expected events MUST be defined in the omnibus actions. If there will be any
> unexpected events, the test will fail. If the event was described in the omnibus actions, but
> wasn't fired, the test will fail too.

### Running tests

To run omnibus test you should run the following command:

```bash
pnpm omnibus:test ${OMNIBUS_NAME}
```

Where OMNIBUS_NAME is the name of the file in the [omnibuses](./src/omnibuses) folder without `.ts` extension.

---

## Keystores

To run omnibus you need to have a keystore with the private key. To set it up you have
to run the following command:

```bash
pnpm ks:add ${KEYSTORE_NAME}
```

Where keystore name can be anything you're comfortable with.

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

Where OMNIBUS_NAME is the name of the file in the [omnibuses](./src/omnibuses) folder without `.ts` extension.
On the run script should output all calls that will be made to the network and ask for your confirmation to continue.
After deployment, you should see next message:

```
Omnibus successfully launched 🎉!
Details:
    Vote ID: 000
    Block number: 12345678
    Launch date: 01 Jan 1970
```

You have to set vote ID in the omnibus file.
Also, you can add launch date to the comments if it looks relevant.

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
  - [omnibuses](./src/omnibuses) - Collection of omnibus related stuff - predefined actions, checks, tools and structures.
  - [providers](./src/providers) - Helpers for working with providers
  - [traces](./src/traces) - Transaction tracing toolset
  - [votes](./src/votes) - Voting toolset
- [tasks](./tasks) - Omnibuses Hardhat tasks. Main entrypoint for running omnibuses.
