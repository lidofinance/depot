import path from "path";
import fs from "fs/promises";
import { NamedKeystore } from "./named-keystore";

export class NamedKeystoresStorage {
  private static instances: Record<string, NamedKeystoresStorage> = {};
  public static create(keystoresDir: string): NamedKeystoresStorage {
    if (!this.instances[keystoresDir]) {
      this.instances[keystoresDir] = new NamedKeystoresStorage(keystoresDir);
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
    return this.accounts!.find((acc) => acc.name === name);
  }

  async add(acc: NamedKeystore): Promise<void> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    this.accounts!.push(acc);
    await this.write(acc);
  }

  async all(): Promise<NamedKeystore[]> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    return this.accounts!;
  }

  async del(name: string): Promise<boolean> {
    if (!this.accounts) {
      this.accounts = await this.loadAccounts();
    }
    const account = this.accounts!.find((acc) => acc.name === name);

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
      fileNames.map(
        async (fileName) =>
          new NamedKeystore(
            fileName.split(".")[0] ?? fileName,
            JSON.parse(await this.read(fileName))
          )
      )
    );
  }

  private async read(fileName: string) {
    return fs.readFile(path.join(this.keystoresDir, fileName), "utf8");
  }

  private async write(keystore: NamedKeystore) {
    await this.checkKeystoresDir();
    await fs.writeFile(this.getKeystorePath(keystore.name), keystore.toString());
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
