import path from "path";
import fs from "fs/promises";

import { Address } from "../common/types";
import { ContractInfo, ContractInfoCache } from "./types";
import { NetworkName } from "../network";

export class ContractInfoInMemoryCache implements ContractInfoCache {
  private data: Partial<Record<string, Record<Address, ContractInfo>>> = {};

  async get(networkName: NetworkName, address: Address) {
    return this.data[networkName.toString()]?.[address] ?? null;
  }

  async set(networkName: NetworkName, address: Address, contractInfo: ContractInfo) {
    if (!this.data[networkName.toString()]) {
      this.data[networkName.toString()] = {};
    }
    this.data[networkName.toString()]![address] = contractInfo;
  }

  async clearAll(): Promise<void> {
    this.data = {};
  }
}

export class ContractInfoPersistentJsonCache implements ContractInfoCache {
  private static instances: Record<string, ContractInfoPersistentJsonCache> = {};

  public static create(dirPath: string) {
    if (!this.instances[dirPath]) {
      this.instances[dirPath] = new ContractInfoPersistentJsonCache(dirPath);
    }
    return this.instances[dirPath];
  }

  private dirPath: string;
  private data: Partial<Record<string, Record<Address, ContractInfo>>> = {};

  public clearAll() {
    this.data = {};
  }

  private constructor(dirPath: string) {
    this.dirPath = dirPath;
  }

  async get(networkName: NetworkName, address: Address) {
    if (!this.data[networkName.toString()]) {
      await this.load(networkName);
    }
    const networkData = this.data[networkName.toString()]!;
    return networkData[address] || null;
  }

  async set(networkName: NetworkName, address: Address, abi: ContractInfo) {
    if (!this.data[networkName.toString()]) {
      await this.load(networkName);
    }
    const networkData = this.data[networkName.toString()];
    if (!networkData) {
      throw new Error("Network data wasn't loaded before write");
    }
    networkData[address] = abi;
    await this.save(networkName);
  }

  private getFilePath(networkName: NetworkName) {
    return path.join(this.dirPath, networkName + ".json");
  }

  private async save(networkName: NetworkName) {
    await fs.writeFile(this.getFilePath(networkName), JSON.stringify(this.data[networkName.toString()], null, "  "));
  }

  private async load(networkName: NetworkName) {
    await this.checkContractAbisDir();
    const fileName = this.getFilePath(networkName);
    await this.checkFile(fileName);
    const rawData = await fs.readFile(fileName, { encoding: "utf-8" });
    this.data[networkName.toString()] = rawData ? JSON.parse(rawData) : {};
  }

  private async checkContractAbisDir() {
    try {
      await fs.access(this.dirPath);
    } catch {
      await fs.mkdir(this.dirPath, { recursive: true });
    }
  }

  private async checkFile(fileName: string) {
    try {
      await fs.access(fileName);
    } catch {
      await fs.writeFile(fileName, "{}");
    }
  }
}
