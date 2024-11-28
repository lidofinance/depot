import chalk from "chalk";
import { task } from "hardhat/config";

import prompt from "../common/prompt";

const TASKS = {
  ADD: "keystore:add",
  LIST: "keystore:list",
  DELETE: "keystore:delete",
  GENERATE: "keystore:generate",
  PASSWORD: "keystore:password",
};

task(TASKS.LIST, "List available accounts").setAction(async (_, hre) => {
  const keystores = await hre.keystores.all();

  if (keystores.length === 0) {
    console.log("Accounts not found.");

    console.log(`You can add or generate account using one of the commands:`);
    console.log("  ", chalk.bold(`npx hardhat ${TASKS.ADD}`));
    console.log("  ", chalk.bold(`npx hardhat ${TASKS.GENERATE}`));
    return;
  }

  console.log(`Found ${keystores.length} accounts:`);
  for (const account of keystores) {
    console.log("  ", account.format());
  }
});

task(TASKS.ADD, "Add a new account by entering a private key")
  .addPositionalParam("name", "Name of the new account")
  .setAction(async ({ name }, hre) => {
    const existedKeystore = await hre.keystores.get(name);
    if (existedKeystore) {
      console.log(`Account ${existedKeystore.format()} already exists`);
      return;
    }
    const newAccount = await hre.keystores.add(name);
    console.log(`A new account ${newAccount.format()} has been added`);
  });

task(TASKS.GENERATE, "Add a new account with a random private key")
  .addPositionalParam("name", "Name of the new account")
  .setAction(async ({ name }, hre) => {
    const existedKeystore = await hre.keystores.get(name);
    if (existedKeystore) {
      console.log(`Account ${existedKeystore.format()} already exists`);
      return;
    }
    const account = await hre.keystores.generate(name);
    console.log(`A new account ${account.format()} has been generated`);
  });

task(TASKS.DELETE, "Delete an existing account")
  .addPositionalParam("name", "Name of the account to delete")
  .setAction(async ({ name }, hre) => {
    const keystore = await hre.keystores.get(name);

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
      await hre.keystores.remove(name);
      console.log(`Account ${keystore.format()} was successfully removed`);
    } catch (e) {
      console.log(`Removal of the account ${keystore.format()} failed. Cause: ${e}`);
    }
  });

task(TASKS.PASSWORD, "Change the password of an existing account")
  .addPositionalParam("name", "Name of the account to change password for")
  .setAction(async ({ name }, hre) => {
    const account = await hre.keystores.password(name);
    console.log(`Password for account ${account.format()} successfully changed`);
  });
