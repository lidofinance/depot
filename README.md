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

You have to set vote ID in the omnibus file.
Also, you can add launch date to the comments if it looks relevant.
