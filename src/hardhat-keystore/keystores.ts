import path from "path";
import chalk from "chalk";
import fs from "fs/promises";
import { Provider } from "ethers";
import { Wallet, HDNodeWallet } from "ethers";
import prompt from "../common/prompt";
import { Address } from "../common/types";

interface KeystoreEthersV6 {
  id: string;
  version: number;
  address: Address;
  Crypto: Record<string, any>;
  "x-ethers": Record<string, any>;
}

interface KeystoreService {
  all(): Promise<NamedKeystore[]>;
  get(name: string): Promise<NamedKeystore>;
  has(name: string): Promise<boolean>;
  add(name: string): Promise<NamedKeystore>;
  add(name: string, privateKey: string, password: string): Promise<NamedKeystore>;
  generate(name: string, password?: string): Promise<NamedKeystore>;
  unlock<T extends Provider>(provider?: T): Promise<Wallet | HDNodeWallet>;
  unlock<T extends Provider>(name: string, provider?: T): Promise<Wallet | HDNodeWallet>;
  unlock<T extends Provider>(
    name: string,
    password?: string,
    provider?: T,
  ): Promise<Wallet | HDNodeWallet>;
  remove(name: string): Promise<NamedKeystore>;
  password(name: string, newPassword?: string, oldPassword?: string): Promise<NamedKeystore>;
}

class NoKeystoreError extends Error {
  constructor() {
    super(`Accounts not found. Aborting...`);
  }
}

class AccountRemovalFailed extends Error {
  constructor(name: string) {
    super(`The removal of account ${name} wasn't successfully finished`);
  }
}

class KeystoreNotFoundError extends Error {
  constructor(name: string) {
    super(`Account "${name}" not found`);
  }
}

class AccountUnlockError extends Error {
  constructor() {
    super("Error on account unlock. Please, make sure that correct password was used. Aborting...");
  }
}

class AccountAlreadyExistsError extends Error {
  constructor(account: NamedKeystore) {
    super(
      `Account with name "${account.name}" (${account.fields.address}) already exists. Aborting...`,
    );
  }
}

export class NamedKeystoreService implements KeystoreService {
  private readonly storage: NamedKeystoreStorage;

  constructor(storage: NamedKeystoreStorage) {
    this.storage = storage;
  }

  async all(): Promise<NamedKeystore[]> {
    return this.storage.all();
  }

  async get(name: string): Promise<NamedKeystore> {
    const keystore = await this.storage.get(name);
    if (!keystore) {
      throw new KeystoreNotFoundError(name);
    }
    return keystore;
  }

  async has(name: string): Promise<boolean> {
    const keystore = await this.storage.get(name);
    return keystore !== undefined;
  }

  async add(name: string): Promise<NamedKeystore>;
  async add(name: string, privateKey: string, password: string): Promise<NamedKeystore>;
  async add(name: string, privateKey?: string, password?: string): Promise<NamedKeystore> {
    const existedAccount = await this.storage.get(name);
    if (existedAccount) {
      throw new AccountAlreadyExistsError(existedAccount);
    }

    privateKey ??= await prompt.secret("Enter the private key you wish to add:");
    password ??= await prompt.password("Enter the password to encrypt this account with:", {
      confirmation: true,
    });

    const account = await NamedKeystore.fromPrivateKey(name, privateKey, password);
    await this.storage.add(account);
    return account;
  }

  async generate(name: string, password?: string): Promise<NamedKeystore> {
    const existedAccount = await this.storage.get(name);
    if (existedAccount) {
      throw new AccountAlreadyExistsError(existedAccount);
    }

    password ??= await prompt.password("Enter the password to encrypt this account with:", {
      confirmation: true,
    });

    const account = await NamedKeystore.generate(name, password);
    await this.storage.add(account);
    return account;
  }

  async unlock<T extends Provider>(provider?: T): Promise<Wallet | HDNodeWallet>;
  async unlock<T extends Provider>(name: string, provider?: T): Promise<Wallet | HDNodeWallet>;
  async unlock<T extends Provider>(
    name: string,
    password?: string,
    provider?: T,
  ): Promise<Wallet | HDNodeWallet>;
  async unlock<T extends Provider>(
    nameOrProvider?: string | T,
    providerOrPassword?: string | T,
    provider?: T,
  ) {
    const name = typeof nameOrProvider === "string" ? nameOrProvider : undefined;
    const keystore = name !== undefined ? await this.get(name) : await this.selectKeystore();

    const password =
      typeof providerOrPassword === "string"
        ? providerOrPassword
        : await prompt.password(`Enter the password to unlock the account ${keystore.format()}`, {
            confirmation: false,
          });
    provider ??= (providerOrPassword as T | undefined) ?? (nameOrProvider as T | undefined);

    return this.decryptKeystore(keystore, password, provider);
  }

  public async remove(name: string): Promise<NamedKeystore> {
    const keystore = await this.get(name);
    const success = await this.storage.del(name);
    if (!success) {
      throw new AccountRemovalFailed(name);
    }
    return keystore;
  }

  private async selectKeystore(): Promise<NamedKeystore> {
    const keystores = await this.storage.all();

    if (keystores.length === 0) {
      throw new NoKeystoreError();
    }

    const accountName = await prompt.select(
      "Select an account to unlock:",
      keystores.map((keystore) => ({ title: keystore.format(), value: keystore.name })),
    );

    return keystores.find((keystore) => keystore.name === accountName)!;
  }

  private async decryptKeystore<T extends Provider>(
    keystore: NamedKeystore,
    password: string,
    provider?: T,
  ) {
    try {
      return keystore.decrypt(password, provider);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("Scrypt:")) {
        throw new AccountUnlockError();
      }
      throw error;
    }
  }

  async password(name: string, newPassword?: string, oldPassword?: string): Promise<NamedKeystore> {
    const wallet = await this.unlock(name, oldPassword);
    newPassword ??= await prompt.password("Enter the new password to encrypt the account with:", {
      confirmation: true,
    });

    const account = await NamedKeystore.fromWallet(name, wallet, newPassword);
    await this.storage.del(name);
    await this.storage.add(account);
    return account;
  }
}

export class NamedKeystore {
  public readonly name: string;
  public readonly fields: KeystoreEthersV6;

  static async fromWallet(name: string, wallet: Wallet | HDNodeWallet, password: string) {
    const keystore = JSON.parse(await wallet.encrypt(password));
    return this.fromKeystore(name, keystore);
  }

  static fromKeystore(name: string, keystore: KeystoreEthersV6) {
    return new NamedKeystore(name, keystore);
  }

  static async fromPrivateKey(name: string, privateKey: string, password: string) {
    const wallet = new Wallet(privateKey);
    return new NamedKeystore(name, JSON.parse(await wallet.encrypt(password)));
  }

  static async generate(name: string, password: string): Promise<NamedKeystore> {
    const wallet = Wallet.createRandom();
    const keystore = JSON.parse(await wallet.encrypt(password));
    return new NamedKeystore(name, keystore);
  }

  private constructor(name: string, keystore: KeystoreEthersV6) {
    this.name = name;
    this.fields = keystore;
  }

  async decrypt<T extends Provider>(
    password: string,
    provider?: T,
  ): Promise<Wallet | HDNodeWallet> {
    try {
      const wallet = await Wallet.fromEncryptedJson(JSON.stringify(this.fields), password);
      return wallet.connect(provider || null);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("Scrypt:")) {
        throw new Error(
          "Error on account loading. Please, make sure that correct password was used",
        );
      }
      throw error;
    }
  }

  format() {
    const prettyName = chalk.magenta.bold(this.name);
    const prettyAddress = chalk.white.bold("0x" + this.fields.address);
    return `${prettyAddress}: ${prettyName}`;
  }
}

export class NamedKeystoreStorage {
  private static instances: Record<string, NamedKeystoreStorage> = {};
  public static create(keystoresDir: string): NamedKeystoreStorage {
    if (!this.instances[keystoresDir]) {
      this.instances[keystoresDir] = new NamedKeystoreStorage(keystoresDir);
    }
    return this.instances[keystoresDir]!;
  }

  private readonly keystoresDir: string;
  private accounts?: NamedKeystore[];

  private constructor(keystoresDir: string) {
    this.keystoresDir = keystoresDir;
  }

  async get(name: string): Promise<NamedKeystore | undefined> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    return this.accounts.find((acc) => acc.name === name);
  }

  async add(acc: NamedKeystore): Promise<void> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    this.accounts.push(acc);
    await this.write(acc.name, acc.fields);
  }

  async all(): Promise<NamedKeystore[]> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    return this.accounts;
  }

  async del(name: string): Promise<boolean> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    const account = this.accounts.find((acc) => acc.name === name);

    if (!account) {
      return false;
    }

    await fs.unlink(this.getKeystorePath(name));
    return true;
  }

  private async loadAccounts() {
    await this.checkKeystoresDir();
    const fileNames = await fs.readdir(this.keystoresDir);
    return Promise.all(
      fileNames.map(async (fileName) =>
        NamedKeystore.fromKeystore(
          fileName.split(".")[0] ?? fileName,
          JSON.parse(await this.read(fileName)),
        ),
      ),
    );
  }

  private async read(fileName: string) {
    return fs.readFile(path.join(this.keystoresDir, fileName), "utf8");
  }

  private async write(name: string, keystore: KeystoreEthersV6) {
    await this.checkKeystoresDir();
    await fs.writeFile(this.getKeystorePath(name), JSON.stringify(keystore, null, "  "));
  }

  private getKeystorePath(name: string) {
    return path.join(this.keystoresDir, `${name}.json`);
  }

  private async checkKeystoresDir() {
    try {
      await fs.access(this.keystoresDir);
    } catch {
      await fs.mkdir(this.keystoresDir, { recursive: true });
    }
  }
}
