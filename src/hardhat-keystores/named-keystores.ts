import bytes from "../common/bytes";
import prompt from "../common/prompt";

import { PrivateKey } from "../common/types";
import { NamedKeystore } from "./named-keystore";
import { assertKeystoreName, NamedKeystoresStorage } from "./named-keystores-storage";
import { KnownError } from "../common/errors";

class NoKeystoreError extends KnownError {
  constructor() {
    super(
      `No keystore accounts found. Add one with "npm run ks:add -- <name>" (import a private key) ` +
        `or "npm run ks:gen -- <name>" (generate a new one)`,
    );
  }
}

class AccountAlreadyExistsError extends KnownError {
  constructor(account: NamedKeystore) {
    super(`Account with name "${account.name}" (${account.address}) already exists. Aborting...`);
  }
}

class InvalidPrivateKey extends KnownError {
  constructor() {
    super(`Private key value is invalid hex string`);
  }
}

export type NamedKeystores = ReturnType<typeof create>;

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

export function create(storage: NamedKeystoresStorage) {
  async function all(): Promise<NamedKeystore[]> {
    return storage.all();
  }

  async function get(name: string): Promise<NamedKeystore | null> {
    return storage.get(name);
  }

  // a mistyped name must fail instead of silently prompting for another account
  async function getOrSelect(name?: string): Promise<NamedKeystore> {
    if (name === undefined) {
      return select();
    }
    const keystore = await get(name);
    if (keystore === null) {
      throw new KnownError(`Account "${name}" not found`);
    }
    return keystore;
  }

  async function add(name: string, privateKey?: string, password?: string): Promise<NamedKeystore> {
    assertKeystoreName(name);
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
    assertKeystoreName(name);
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
    const keystore = await getOrSelect(name);

    const account = await NamedKeystore.fromPrivateKey(
      keystore.name,
      await keystore.decrypt(oldPassword ?? (await promptCurrentPassword(keystore.name))),
      newPassword ?? (await promptNewPassword()),
    );
    await storage.replace(account);
    return account;
  }

  async function select(): Promise<NamedKeystore> {
    const keystores = await storage.all();

    if (keystores.length === 0) {
      throw new NoKeystoreError();
    }

    const accountName = await prompt.select(
      "Select an account:",
      keystores.map((keystore) => ({ title: keystore.format(), value: keystore.name })),
    );

    const selected = keystores.find((keystore) => keystore.name === accountName);
    if (!selected) {
      throw new KnownError(`Account "${String(accountName)}" not found`);
    }
    return selected;
  }

  async function unlock(name?: string, password?: string): Promise<PrivateKey> {
    const keystore = await getOrSelect(name);
    return keystore.decrypt(password ?? (await promptCurrentPassword(keystore.name)));
  }

  return {
    all,
    get,
    add,
    select,
    remove,
    unlock,
    generate,
    password,
  };
}
