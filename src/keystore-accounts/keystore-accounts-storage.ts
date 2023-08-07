import path from "path";
import chalk from "chalk";
import fs from "fs/promises";
import type { Provider } from "ethers";
import { Wallet, HDNodeWallet } from "ethers";

type Keystore = {
  id: string;
  version: number;
  address: Address;
  crypto: Record<string, any>;
};

export class KeystoreAccount {
  public readonly name: string;
  public readonly address: string;
  public readonly keystore: Keystore;

  static async fromWallet(name: string, wallet: Wallet | HDNodeWallet, password: string) {
    const keystore = JSON.parse(await wallet.encrypt(password));
    return this.fromKeystore(name, keystore);
  }

  static fromKeystore(name: string, keystore: Keystore) {
    return new KeystoreAccount(name, keystore);
  }

  static async fromPrivateKey(name: string, privateKey: string, password: string) {
    const wallet = new Wallet(privateKey);
    return new KeystoreAccount(name, JSON.parse(await wallet.encrypt(password)));
  }

  static async generate(name: string, password: string): Promise<KeystoreAccount> {
    const wallet = Wallet.createRandom();
    const keystore = JSON.parse(await wallet.encrypt(password));
    return new KeystoreAccount(name, keystore);
  }

  private constructor(name: string, keystore: Keystore) {
    this.name = name;
    this.keystore = keystore;
    this.address = keystore.address;
  }

  async decrypt<T extends Provider>(
    password: string,
    provider?: T,
  ): Promise<Wallet | HDNodeWallet> {
    try {
      const wallet = await Wallet.fromEncryptedJson(JSON.stringify(this.keystore), password);
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
    const prettyAddress = chalk.white.bold("0x" + this.keystore.address);
    return `${prettyAddress}: ${prettyName}`;
  }
}

export class KeystoreAccountsStorage {
  private static instances: Record<string, KeystoreAccountsStorage> = {};
  public static create(keystoresDir: string) {
    if (!this.instances[keystoresDir]) {
      this.instances[keystoresDir] = new KeystoreAccountsStorage(keystoresDir);
    }
    return this.instances[keystoresDir];
  }

  private readonly keystoresDir: string;
  private accounts?: KeystoreAccount[];

  private constructor(keystoresDir: string) {
    this.keystoresDir = keystoresDir;
  }

  async get(name: string): Promise<KeystoreAccount | undefined> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    return this.accounts.find((acc) => acc.name === name);
  }

  async add(acc: KeystoreAccount): Promise<void> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    this.accounts.push(acc);
    await this.write(acc.name, acc.keystore);
  }

  async all(): Promise<KeystoreAccount[]> {
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
        KeystoreAccount.fromKeystore(fileName.split(".")[0], JSON.parse(await this.read(fileName))),
      ),
    );
  }

  private async read(fileName: string) {
    return fs.readFile(path.join(this.keystoresDir, fileName), "utf8");
  }

  private async write(name: string, keystore: Keystore) {
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
