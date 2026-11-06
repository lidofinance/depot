import path from "path";
import fs from "fs/promises";
import { KeyStore } from "web3-types";
import { NamedKeystore } from "./named-keystore";
import { KnownError } from "../common/errors";

const KEYSTORE_EXTENSION = ".json";
const KEYSTORE_FILE_MODE = 0o600;
const KEYSTORE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function assertKeystoreName(name: string) {
  if (!KEYSTORE_NAME_PATTERN.test(name)) {
    throw new KnownError(`Invalid keystore name "${name}": only letters, digits, "_" and "-" are allowed`);
  }
}

export class NamedKeystoresStorage {
  private static instances: Record<string, NamedKeystoresStorage> = {};
  public static create(keystoresDir: string): NamedKeystoresStorage {
    this.instances[keystoresDir] ??= new NamedKeystoresStorage(keystoresDir);
    return this.instances[keystoresDir];
  }

  private readonly keystoresDir: string;
  private accounts: NamedKeystore[];
  private isLoaded: boolean = false;

  private constructor(keystoresDir: string) {
    this.keystoresDir = keystoresDir;
    this.accounts = [];
  }

  async get(name: string): Promise<NamedKeystore | null> {
    await this.loadAccountsFromFS();
    return this.accounts.find((acc) => acc.name === name) || null;
  }

  async add(acc: NamedKeystore): Promise<void> {
    await this.write(acc);
    this.accounts.push(acc);
  }

  async replace(keystore: NamedKeystore): Promise<void> {
    await this.checkKeystoresDir();
    const keystorePath = this.getKeystorePath(keystore.name);
    // not ending in ".json", so a leftover temp file is never loaded as a keystore
    const tempPath = `${keystorePath}.tmp`;
    // a temp file left by a crashed run is ours; "wx" then refuses one that appears concurrently
    await fs.rm(tempPath, { force: true });
    try {
      await fs.writeFile(tempPath, keystore.toJson(), { mode: KEYSTORE_FILE_MODE, flag: "wx" });
      await fs.rename(tempPath, keystorePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
    this.accounts = [...this.accounts.filter((existing) => existing.name !== keystore.name), keystore];
  }

  async all(): Promise<NamedKeystore[]> {
    await this.loadAccountsFromFS();
    return this.accounts;
  }

  async del(name: string) {
    await fs.unlink(this.getKeystorePath(name));
    this.accounts = this.accounts.filter((acc) => acc.name !== name);
  }

  private async loadAccountsFromFS() {
    if (this.isLoaded) {
      return;
    }
    await this.checkKeystoresDir();
    const fileNames = (await fs.readdir(this.keystoresDir)).filter((fileName) => fileName.endsWith(KEYSTORE_EXTENSION));
    this.accounts = await Promise.all(
      fileNames.map(
        async (fileName) =>
          new NamedKeystore(
            fileName.slice(0, -KEYSTORE_EXTENSION.length),
            JSON.parse(await this.read(fileName)) as KeyStore,
          ),
      ),
    );
    this.isLoaded = true;
  }

  private async read(fileName: string) {
    return fs.readFile(path.join(this.keystoresDir, fileName), "utf8");
  }

  private async write(keystore: NamedKeystore) {
    await this.checkKeystoresDir();
    await fs.writeFile(this.getKeystorePath(keystore.name), keystore.toJson(), {
      mode: KEYSTORE_FILE_MODE,
      flag: "wx",
    });
  }

  private getKeystorePath(name: string) {
    assertKeystoreName(name);
    return path.join(this.keystoresDir, `${name}${KEYSTORE_EXTENSION}`);
  }

  private async checkKeystoresDir() {
    try {
      await fs.access(this.keystoresDir);
    } catch {
      await fs.mkdir(this.keystoresDir, { recursive: true });
    }
  }
}
