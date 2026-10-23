# 👷🏼 Depot

The purpose of this repo is to build, test and run omnibuses.

## Install

Install Node.js (includes npm) - https://nodejs.org/en/download
Install nvm - https://github.com/nvm-sh/nvm

Install docker - https://docs.docker.com/engine/install/

Use Foundry v1.8.1 for Solidity formatting and contract generation, matching CI: `foundryup --install v1.8.1`.

## ABI synchronization

Use `npm run abi:sync -- <Name>` to generate a TypeScript ABI and Solidity interface from Etherscan or a local JSON file. See the [ABI sync guide](./docs/ABI_SYNC.md) for source selection, proxy handling, method filtering and verification.

## Omnibus

The main purpose of the omnibus is to prepare the EVM script that will be executed if the vote is successful. The voting EVM script is built from the omnibus items defined in the omnibus. During the run, the omnibus will call the

```
newVote(bytes executionScript, string metadata, bool castVote, bool executesIfDecided)
```

[function of the voting contract](https://github.com/aragon/aragon-apps/blob/b72da2c6606a361d0160d5d78fb534018ba3ce91/apps/voting/contracts/Voting.sol#L138) with the prepared script and description.

### Omnibus documentation

For the current human-readable writing guide and examples, use:

- [docs/omnibuses/README.md](./docs/omnibuses/README.md)
- [docs/omnibuses/WRITING_OMNIBUS.md](./docs/omnibuses/WRITING_OMNIBUS.md)

### Agent workflow (Codex / Claude)

Recommended flow when using agents:

1. Start with command to the agent: `omnibus create`.
2. Agent (or you manually) creates a new omnibus from template:
   ```bash
   npm run omnibus:create
   ```
3. Open `omnibuses/<omnibus_name>/<omnibus_name>.md` and fill description in block:

   ```md
   <!-- OMNIBUS_DESCRIPTION -->

   ... free-form action list and context ...

   <!-- OMNIBUS_DESCRIPTION -->
   ```

4. Ask the agent to transform that description into concrete omnibus items in `<omnibus_name>.ts`.
5. Decide contract mode:
   - no contract: keep regular omnibus script
   - with contract: generate dedicated Solidity omnibus contract
6. Contract generation is opt-in and must be explicitly requested by user.
7. If contract mode is needed, generate Solidity contract from the omnibus script:
   ```bash
   npm run omnibus:contract -- <omnibus_name>
   ```
8. Immediately compile generated Solidity contract:
   ```bash
   npm run omnibus:build -- <omnibus_name>
   ```
9. For contract mode, ensure omnibus `.ts` has `deploy()` (returning `omnibus`) or explicit `deployment` mapping.
10. Finalize calls/events/tests with the agent, then validate and run:

    ```bash
    npm run omnibus:test -- <omnibus_name>
    npm run omnibus:simulate -- <omnibus_name>
    npm run omnibus:run -- <omnibus_name>
    ```

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

1. Due to proper work of all Depot features like simulating, testing, etc you have to have running [local hardhat node](https://github.com/lidofinance/hardhat-node)
2. Clone the repo
   ```shell
   git clone git@github.com:lidofinance/depot.git
   ```
3. Change dir
   ```shell
   cd depot
   ```
4. Use required Node.js version
   ```shell
   nvm use
   ```
5. Install dependencies via
   ```shell
   npm install
   ```
6. Types will be generated automatically via postinstall script
7. Seed the `.env` file from the `.env.example`
   ```shell
   cp .env.example .env1
   ```
8. Fill variables in

Useful commands for onboarding:

1. List of available tasks
   ```shell
   hardhat --help
   ```
2. Task info
   ```shell
   hardhat <task-name> --help
   ```
3. Other short calls in file `paskage.json` in `scripts` -> `example:....`

## Writing omnibuses

You need to create a new file in the [omnibuses](./src/omnibuses) folder.
Naming convention is to name omnibuses `${YYYY_MM_DD}.ts`.

Writing an omnibus essentially means packing a bunch of omnibus items into an `omnibuses.create` call along with the additional parametres:

- `network` - one of the allowed network names. At the moment it's `mainnet` and `holesky`

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

You can find the detailed example of the omnibus in this [file](./omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts).

## Testing omnibus

Each omnibus MUST be thoroughly tested before running on the mainnet.

### Writing tests

To test an omnibus you need to create a new file in the [omnibuses](./omnibuses) folder with the same name as the omnibus file but with the `.spec.ts` extension.

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
npm run omnibus:test -- ${OMNIBUS_NAME}
```

Where `${OMNIBUS_NAME}` is the name of the file in the [omnibuses](./omnibuses) folder without `.ts` extension.

## Keystores

To run omnibus you need to have a keystore with the private key. To set it up you have
to run the following command:

```bash
npm run ks:add -- ${KEYSTORE_NAME}
```

Where `${KEYSTORE_NAME}` can be anything you're comfortable with.

To list all available keystores you can run the following command:

```bash
npm run ks:ls
```

To remove keystore you can run the following command:

```bash
npm run ks:del -- ${KEYSTORE_NAME}
```

To generate a new keystore you can run the following command:

```bash
npm run ks:gen -- ${KEYSTORE_NAME}
```

To change the keystore password you can run the following command:

```bash
npm run ks:pwd -- ${KEYSTORE_NAME}
```

## Run omnibus

To run omnibus you need to run the following command:

```bash
npm run omnibus:run -- ${OMNIBUS_NAME}
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

# Examples

Test tiny omnibus at mainnet

```shell
  npm run omnibus:test -- _example_tiny_holesky_omnibus
```

Test tiny omnibus at holesky

```shell
  npm run omnibus:test -- _example_tiny_holesky_omnibus
```

Run tiny omnibus at holesky (you will need to add keystone first)

```shell
  npm run omnibus:run -- _example_tiny_holesky_omnibus --rpc remote --test-account false --network holesky
```

### Run tests from other repos at mainnet

Logs in log directory - [logs](./logs)

Multitest params description:

```shell
  hardhat omnibus:multi-test -- help
```

Run tiny omnibus and test form `mount` folder in other repos env

```shell
  hardhat omnibus:multi-test _example_tiny_omnibus --mount-tests true --pattern default --hide-debug true
```

Run tiny omnibus and regression tests in other repos env

```shell
  hardhat omnibus:multi-test _example_tiny_omnibus --hide-debug true
```

# Project structure

This project is structured as follows:

- [archive](./archive) - Old omnibuses and tests
- [interfaces](./interfaces) - ABI's of Lido contracts
- [omnibuses](./omnibuses) - Actual omnibuses
- [docs](./docs) - Human-readable documentation and guides
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
  - [votes](./src/aragon-votes-tools) - Voting toolset
- [tasks](./tasks) - Omnibuses Hardhat tasks. Main entrypoint for running omnibuses.
