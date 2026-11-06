import chalk from "chalk";
import { HardhatRuntimeEnvironment } from "hardhat/types/hre";

import prompt from "@/src/common/prompt";
import { getKeystores } from "@/src/hardhat-keystores";
import { createTaskRegistry, lazy } from "./define-task";

const KEYSTORE_TASKS = {
  ADD: "keystore:add",
  LIST: "keystore:list",
  DELETE: "keystore:delete",
  GENERATE: "keystore:generate",
  PASSWORD: "keystore:password",
};

const { builders: keystoreTaskBuilders, defineTask } = createTaskRegistry();
export { keystoreTaskBuilders };

defineTask(KEYSTORE_TASKS.LIST, "List available accounts").setAction(
  lazy(async (_: unknown, hre: HardhatRuntimeEnvironment) => {
    const keystores = await getKeystores(hre).all();

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
    lazy(async ({ name }: { name: string }, hre: HardhatRuntimeEnvironment) => {
      const account = await getKeystores(hre).add(name);
      console.log(`A new account ${account.format()} has been added`);
    }),
  );

defineTask(KEYSTORE_TASKS.GENERATE, "Add a new account with a random private key")
  .addPositionalArgument({ name: "name", description: "Name of the new account" })
  .setAction(
    lazy(async ({ name }: { name: string }, hre: HardhatRuntimeEnvironment) => {
      const account = await getKeystores(hre).generate(name);
      console.log(`A new account ${account.format()} has been generated`);
    }),
  );

defineTask(KEYSTORE_TASKS.DELETE, "Delete an existing account")
  .addPositionalArgument({ name: "name", description: "Name of the account to delete" })
  .setAction(
    lazy(async ({ name }: { name: string }, hre: HardhatRuntimeEnvironment) => {
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
      await keystores.remove(name);
      console.log(`Account ${keystore.format()} was successfully removed`);
    }),
  );

defineTask(KEYSTORE_TASKS.PASSWORD, "Change the password of an existing account")
  .addPositionalArgument({ name: "name", description: "Name of the account to change password for" })
  .setAction(
    lazy(async ({ name }: { name: string }, hre: HardhatRuntimeEnvironment) => {
      const account = await getKeystores(hre).password(name);
      console.log(`Password for account ${account.format()} successfully changed`);
    }),
  );
