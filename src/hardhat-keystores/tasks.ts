import chalk from "chalk";
import { task } from "hardhat/config";

import prompt from "../common/prompt";
import { getKeystores } from "./get-keystores";

type TaskAction = (taskArguments: any, hre: any) => any;

function asLazyAction(action: TaskAction) {
  return async () => ({ default: action });
}

const KEYSTORE_TASKS = {
  ADD: "keystore:add",
  LIST: "keystore:list",
  DELETE: "keystore:delete",
  GENERATE: "keystore:generate",
  PASSWORD: "keystore:password",
};

export const keystoreTaskBuilders: Array<ReturnType<typeof task>> = [];
function defineTask(...args: Parameters<typeof task>) {
  const builder = task(...args);
  keystoreTaskBuilders.push(builder);
  return builder;
}

defineTask(KEYSTORE_TASKS.LIST, "List available accounts").setAction(
  asLazyAction(async (_, hre) => {
  const keystoresService = getKeystores(hre);
  const keystores = await keystoresService.all();

  if (keystores.length === 0) {
    console.log("Accounts not found.");

    console.log(`You can add or generate account using one of the commands:`);
    console.log("  ", chalk.bold(`npx hardhat ${KEYSTORE_TASKS.ADD} <name>`));
    console.log("  ", chalk.bold(`npx hardhat ${KEYSTORE_TASKS.GENERATE} <name>`));
    return;
  }

  console.log(`Found ${keystores.length} accounts:`);
  for (const account of keystores) {
    console.log("  ", account.format());
  }
  }),
);

defineTask(KEYSTORE_TASKS.ADD, "Add a new account by entering a private key")
  .addPositionalArgument({ name: "name", description: "Name of the new account" })
  .setAction(
    asLazyAction(async ({ name }, hre) => {
    const keystores = getKeystores(hre);
    const existedKeystore = await keystores.get(name);
    if (existedKeystore) {
      console.log(`Account ${existedKeystore.format()} already exists`);
      return;
    }
    const newAccount = await keystores.add(name);
    console.log(`A new account ${newAccount.format()} has been added`);
    }),
  );

defineTask(KEYSTORE_TASKS.GENERATE, "Add a new account with a random private key")
  .addPositionalArgument({ name: "name", description: "Name of the new account" })
  .setAction(
    asLazyAction(async ({ name }, hre) => {
    const keystores = getKeystores(hre);
    const existedKeystore = await keystores.get(name);
    if (existedKeystore) {
      console.log(`Account ${existedKeystore.format()} already exists`);
      return;
    }
    const account = await keystores.generate(name);
    console.log(`A new account ${account.format()} has been generated`);
    }),
  );

defineTask(KEYSTORE_TASKS.DELETE, "Delete an existing account")
  .addPositionalArgument({ name: "name", description: "Name of the account to delete" })
  .setAction(
    asLazyAction(async ({ name }, hre) => {
    const keystores = getKeystores(hre);
    const keystore = await keystores.get(name);

    if (!keystore) {
      console.log(`Account with name ${name} not found`);
      return;
    }

    const confirmed = await prompt.confirm(`Are you sure you want to delete ${keystore.format()} account?`);

    if (!confirmed) {
      console.log("Operation was canceled by the user");
      return;
    }
    try {
      await keystores.remove(name);
      console.log(`Account ${keystore.format()} was successfully removed`);
    } catch (e) {
      console.log(`Removal of the account ${keystore.format()} failed. Cause: ${e}`);
    }
    }),
  );

defineTask(KEYSTORE_TASKS.PASSWORD, "Change the password of an existing account")
  .addPositionalArgument({ name: "name", description: "Name of the account to change password for" })
  .setAction(
    asLazyAction(async ({ name }, hre) => {
    const account = await getKeystores(hre).password(name);
    console.log(`Password for account ${account.format()} successfully changed`);
    }),
  );
