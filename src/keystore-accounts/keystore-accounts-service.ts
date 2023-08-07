import path from "path";

import type { Provider } from "ethers";

import prompt from "../common/prompt";
import { ROOT_PATH } from "../constants";
import { KeystoreAccount, KeystoreAccountsStorage } from "./keystore-accounts-storage";

const ACCOUNTS_PATH = path.join(ROOT_PATH, "accounts");
const STORAGE = KeystoreAccountsStorage.create(ACCOUNTS_PATH);

class NoAccountsError extends Error {
  constructor() {
    super(`Accounts not found. Aborting...`);
  }
}

class AccountRemovalFailed extends Error {
  constructor(name: string) {
    super(`The removal of account ${name} wasn't successfully finished`);
  }
}

class AccountNotFoundError extends Error {
  constructor(name: string) {
    super(`Account ${name} not found`);
  }
}

class AccountUnlockError extends Error {
  constructor() {
    super("Error on account unlock. Please, make sure that correct password was used. Aborting...");
  }
}

class AccountAlreadyExistsError extends Error {
  constructor(account: KeystoreAccount) {
    super(`Account with name "${account.name}" (${account.address}) already exists. Aborting...`);
  }
}

async function all() {
  return STORAGE.all();
}

async function get(name: string) {
  const account = await STORAGE.get(name);
  if (!account) {
    throw new AccountNotFoundError(name);
  }
  return account;
}

async function add(name: string) {
  const existedAccount = await STORAGE.get(name);
  if (existedAccount) {
    throw new AccountAlreadyExistsError(existedAccount);
  }
  const privateKey = await prompt.secret("Enter the private key you wish to add:");
  const password = await prompt.password("Enter the password to encrypt this account with:", {
    confirmation: true,
  });

  const account = await KeystoreAccount.fromPrivateKey(name, privateKey, password);
  await STORAGE.add(account);
  console.log(`A new account ${account.format()} has been added`);
}

async function generate(name: string) {
  const existedAccount = await STORAGE.get(name);
  if (existedAccount) {
    throw new AccountAlreadyExistsError(existedAccount);
  }
  const password = await prompt.password("Enter the password to encrypt this account with:", {
    confirmation: true,
  });

  const account = await KeystoreAccount.generate(name, password);
  await STORAGE.add(account);
  console.log(`A new account ${account.format()} has been generated`);
}

async function unlock<T extends Provider>(
  name: string,
  provider?: T,
): ReturnType<KeystoreAccount["decrypt"]>;
async function unlock<T extends Provider>(provider?: T): ReturnType<KeystoreAccount["decrypt"]>;
async function unlock<T extends Provider>(nameOrProvider?: string | T, provider?: T) {
  const account =
    typeof nameOrProvider === "string" ? await get(nameOrProvider) : await selectAccount();

  const password = await prompt.password(
    `Enter the password to unlock the account ${account.format()}`,
    {
      confirmation: false,
    },
  );

  return unlockAccount(
    account,
    password,
    provider ?? typeof nameOrProvider === "string" ? undefined : nameOrProvider,
  );
}

async function remove(name: string) {
  const account = await get(name);

  const confirmed = await prompt.confirm(
    `Are you sure you want to delete ${account.format()} account?`,
  );

  if (!confirmed) {
    console.log("Operation was canceled by the user");
    return;
  }

  const success = await STORAGE.del(name);
  if (!success) {
    throw new AccountRemovalFailed(name);
  }
  console.log(`Account ${account.format()} was successfully removed`);
}

async function password(name: string) {
  const wallet = await unlock(name);
  const newPassword = await prompt.password("Enter the new password to encrypt the account with:", {
    confirmation: true,
  });
  const account = await KeystoreAccount.fromWallet(name, wallet, newPassword);
  await STORAGE.del(name);
  await STORAGE.add(account);
  console.log(`Password for account ${account.format()} successfully changed`);
}

async function selectAccount(): Promise<KeystoreAccount> {
  const accounts = await STORAGE.all();

  if (accounts.length === 0) {
    throw new NoAccountsError();
  }

  const accountName = await prompt.select(
    "Select an account to unlock:",
    accounts.map((acc) => ({ title: acc.format(), value: acc.name })),
  );

  return accounts.find((acc) => acc.name === accountName)!;
}

async function unlockAccount<T extends Provider>(
  account: KeystoreAccount,
  password: string,
  provider?: T,
) {
  try {
    const wallet = await account.decrypt(password, provider);
    console.log(`Account ${account.format()} was successfully unlocked.`);
    return wallet;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Scrypt:")) {
      throw new AccountUnlockError();
    }
    throw error;
  }
}

export default {
  all,
  add,
  unlock,
  remove,
  generate,
  password,
};
