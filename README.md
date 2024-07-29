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

Each action can produce one or more calls to the network.

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

An example of the omnibus [file](./omnibuses/_demo_omnibus.ts) is below:

```typescript
export default new Omnibus({
  network: "mainnet",
  // launchedOn: 12345678, // Launch block number should be set only if omnibus was successfully launched.
  // voteId: 000, // Vote ID should be set only if omnibus is already started.
  // executedOn: 12345678,  // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: false, // Should be set to true if quorum was reached during the vote.
  actions: ({ ldo }) => [
    new UpdateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%", // Title is always required
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 400,
      treasuryFee: 5,
      stakingModuleFee: 10,
    }),
    new TransferAssets({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig", // Title is always required
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", // Pool Maintenance Labs Ltd. (PML) multisig
      token: ldo,
      amount: 180000n * 10n ** 18n,
    }),
  ],
});
```

Usually, it should be enough action to build an omnibus. Every action is able to test its own logic,
so usually you don't need to write additional tests for the omnibus itself.

## Test omnibus

To test omnibus you need to run the following command:

```bash
pnpm omnibus:test ${OMNIBUS_NAME}
```

Where OMNIBUS_NAME is the name of the file in the [omnibuses](./src/omnibuses) folder without `.ts` extension.

On test run script should output all supposed calls that should be made to the network.

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

You have to set vote ID in the omnibus file along with the block number.
Also, you can add launch date to the comments if it looks relevant.
