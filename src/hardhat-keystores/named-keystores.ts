import bytes from "../common/bytes";
import prompt from "../common/prompt";

import { PrivateKey } from "../common/types";
import { NamedKeystore } from "./named-keystore";
import { NamedKeystoresStorage } from "./named-keystores-storage";

export class NoKeystoreError extends Error {
  constructor() {
    super(`Accounts not found. Aborting...`);
  }
}

export class AccountAlreadyExistsError extends Error {
  constructor(account: NamedKeystore) {
    super(`Account with name "${account.name}" (${account.address}) already exists. Aborting...`);
  }
}

class InvalidPrivateKey extends Error {
  constructor() {
    super(`Private key value is invalid hex string`);
  }
}

export interface NamedKeystores {
  all(): Promise<NamedKeystore[]>;
  has(name: string): Promise<boolean>;
  get(name: string): Promise<NamedKeystore | null>;
  add(name: string): Promise<NamedKeystore>;
  add(name: string, privateKey: string, password: string): Promise<NamedKeystore>;
  add(name: string, privateKey?: string, password?: string): Promise<NamedKeystore>;
  select(): Promise<NamedKeystore>;
  remove(name: string): Promise<void>;
  unlock(name?: string, password?: string): Promise<PrivateKey>;
  generate(name: string, password?: string): Promise<NamedKeystore>;
  password(name: string, newPassword?: string, oldPassword?: string): Promise<NamedKeystore>;
}

function promptCurrentPassword(keystoreName: string): Promise<string> {
  return prompt.password(`Enter the password to unlock the account ${keystoreName}`, {
    confirmation: false,
  });
}

function promptNewPassword(): Promise<string> {
  return prompt.password("Enter the new password to encrypt the account with:", {
    confirmation: true,
  });
}

export function create(storage: NamedKeystoresStorage): NamedKeystores {
  async function all(): Promise<NamedKeystore[]> {
    return storage.all();
  }

  async function get(name: string): Promise<NamedKeystore | null> {
    return storage.get(name);
  }

  // getOrSelect is a helper function that will either return the keystore with the given name or prompt the user to select one
  async function getOrSelect(name?: string): Promise<NamedKeystore> {
    if (name === undefined) {
      return select();
    }
    const keystore = await get(name);
    if (keystore !== null) {
      return keystore;
    }
    return select();
  }

  async function has(name: string): Promise<boolean> {
    const keystore = await storage.get(name);
    return keystore !== null;
  }

  async function add(name: string, privateKey?: string, password?: string): Promise<NamedKeystore> {
    const existedAccount = await storage.get(name);
    if (existedAccount) {
      throw new AccountAlreadyExistsError(existedAccount);
    }

    privateKey ??= await prompt.secret("Enter the private key you wish to add:");

    if (!bytes.isValid(privateKey)) {
      throw new InvalidPrivateKey();
    }

    password ??= await prompt.password("Enter the password to encrypt this account with:", {
      confirmation: true,
    });

    const account = await NamedKeystore.fromPrivateKey(name, bytes.normalize(privateKey), password);
    await storage.add(account);
    return account;
  }

  async function generate(name: string, password?: string): Promise<NamedKeystore> {
    const existedAccount = await storage.get(name);
    if (existedAccount) {
      throw new AccountAlreadyExistsError(existedAccount);
    }

    password ??= await prompt.password("Enter the password to encrypt this account with:", {
      confirmation: true,
    });

    const account = await NamedKeystore.generate(name, password);
    await storage.add(account);
    return account;
  }

  async function remove(name: string) {
    await storage.del(name);
  }

  async function password(name: string, newPassword?: string, oldPassword?: string): Promise<NamedKeystore> {
    let keystore = await getOrSelect(name);

    const account = await NamedKeystore.fromPrivateKey(
      name,
      await keystore.decrypt(oldPassword ?? (await promptCurrentPassword(keystore.name))),
      newPassword ?? (await promptNewPassword()),
    );
    await storage.del(name);
    await storage.add(account);
    return account;
  }

  async function select(): Promise<NamedKeystore> {
    const keystores = await storage.all();

    if (keystores.length === 0) {
      throw new NoKeystoreError();
    }

    const accountName = await prompt.select(
      "Select an account to unlock:",
      keystores.map((keystore) => ({ title: keystore.format(), value: keystore.name })),
    );

    return keystores.find((keystore) => keystore.name === accountName)!;
  }

  async function unlock(name?: string, password?: string): Promise<PrivateKey> {
    const keystore = await getOrSelect(name);
    return keystore.decrypt(password ?? (await promptCurrentPassword(keystore.name)));
  }

  return {
    all,
    has,
    get,
    add,
    select,
    remove,
    unlock,
    generate,
    password,
  };
}
