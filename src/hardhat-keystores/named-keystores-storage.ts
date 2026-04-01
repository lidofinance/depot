import fs from 'fs/promises'
import path from 'path'

import { NamedKeystore } from './named-keystore'

export class NamedKeystoresStorage {
  private static instances: Record<string, NamedKeystoresStorage> = {}
  public static create(keystoresDir: string): NamedKeystoresStorage {
    if (!this.instances[keystoresDir]) {
      this.instances[keystoresDir] = new NamedKeystoresStorage(keystoresDir)
    }
    return this.instances[keystoresDir]!
  }

  private readonly keystoresDir: string
  private accounts: NamedKeystore[]
  private isLoaded: boolean = false

  private constructor(keystoresDir: string) {
    this.keystoresDir = keystoresDir
    this.accounts = []
  }

  async get(name: string): Promise<NamedKeystore | null> {
    await this.loadAccountsFromFS()
    return this.accounts.find((acc) => acc.name === name) || null
  }

  async add(acc: NamedKeystore): Promise<void> {
    await this.write(acc)
    this.accounts.push(acc)
  }

  async all(): Promise<NamedKeystore[]> {
    await this.loadAccountsFromFS()
    return this.accounts
  }

  async del(name: string) {
    await fs.unlink(this.getKeystorePath(name))
    this.accounts = this.accounts.filter((acc) => acc.name !== name)
  }

  private async loadAccountsFromFS() {
    if (this.isLoaded) {
      return
    }
    await this.checkKeystoresDir()
    const fileNames = await fs.readdir(this.keystoresDir)
    this.accounts = await Promise.all(
      fileNames.map(
        async (fileName) =>
          new NamedKeystore(fileName.split('.')[0] ?? fileName, JSON.parse(await this.read(fileName)) as NamedKeystore),
      ),
    )
    this.isLoaded = true
  }

  private read(fileName: string) {
    return fs.readFile(path.join(this.keystoresDir, fileName), 'utf8')
  }

  private async write(keystore: NamedKeystore) {
    await this.checkKeystoresDir()
    await fs.writeFile(this.getKeystorePath(keystore.name), keystore.toJson())
  }

  private getKeystorePath(name: string) {
    return path.join(this.keystoresDir, `${name}.json`)
  }

  private async checkKeystoresDir() {
    try {
      await fs.access(this.keystoresDir)
    } catch {
      await fs.mkdir(this.keystoresDir, { recursive: true })
    }
  }
}
