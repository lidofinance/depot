import chalk from "chalk";
import { task } from "hardhat/config";
import keystoreAccounts from "../src/keystore-accounts";

const COMMANDS = {
  ADD_ACCOUNT: "accounts:add",
  LIST_ACCOUNTS: "accounts:list",
  DELETE_ACCOUNT: "accounts:delete",
  GENERATE_ACCOUNT: "accounts:generate",
  CHANGE_PASSWORD: "accounts:password",
};

task(COMMANDS.LIST_ACCOUNTS, "List available accounts").setAction(async () => {
  const accounts = await keystoreAccounts.all();

  if (accounts.length === 0) {
    console.log("Accounts not found.");
    const addCommand = chalk.bold(`npx hardhat ${COMMANDS.ADD_ACCOUNT}`);
    const generateCommand = chalk.bold(`npx hardhat ${COMMANDS.GENERATE_ACCOUNT}`);

    console.log(`You can add or generate account using one of the commands:`);
    console.log("  ", addCommand);
    console.log("  ", generateCommand);
    return;
  }

  console.log(`Found ${accounts.length} accounts:`);
  for (const account of accounts) {
    console.log("  ", account.format());
  }
});

task(COMMANDS.ADD_ACCOUNT, "Add a new account by entering a private key")
  .addPositionalParam("name", "Name of the new account")
  .setAction(({ name }) => keystoreAccounts.add(name));

task(COMMANDS.GENERATE_ACCOUNT, "Add a new account with a random private key")
  .addPositionalParam("name", "Name of the new account")
  .setAction(({ name }) => keystoreAccounts.generate(name));

task(COMMANDS.DELETE_ACCOUNT, "Delete an existing account")
  .addPositionalParam("name", "Name of the account to delete")
  .setAction(({ name }) => keystoreAccounts.remove(name));

task(COMMANDS.CHANGE_PASSWORD, "Change the password of an existing account")
  .addPositionalParam("name", "Name of the account to change password for")
  .setAction(({ name }) => keystoreAccounts.password(name));
