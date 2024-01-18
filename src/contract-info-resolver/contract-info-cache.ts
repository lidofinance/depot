import path from "path";
import fs from "fs/promises";

import { ChainId } from "../common/types";
import { ContractInfo, ContractInfoCache } from "./types";

export class ContractInfoInMemoryCache implements ContractInfoCache {
  private data: Partial<Record<string, Record<Address, ContractInfo>>> = {};

  async get(chainId: ChainId, address: Address) {
    return this.data[chainId.toString()]?.[address] ?? null;
  }

  async set(chainId: ChainId, address: Address, contractInfo: ContractInfo) {
    if (!this.data[chainId.toString()]) {
      this.data[chainId.toString()] = {};
    }
    this.data[chainId.toString()]![address] = contractInfo;
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

  private constructor(dirPath: string) {
    this.dirPath = dirPath;
  }

  async get(chainId: ChainId, address: Address) {
    if (!this.data[chainId.toString()]) {
      await this.load(chainId);
    }
    const networkData = this.data[chainId.toString()]!;
    return networkData[address] || null;
  }

  async set(chainId: ChainId, address: Address, abi: ContractInfo) {
    if (!this.data[chainId.toString()]) {
      await this.load(chainId);
    }
    const networkData = this.data[chainId.toString()];
    if (!networkData) {
      throw new Error("Network data wasn't loaded before write");
    }
    networkData[address] = abi;
    await this.save(chainId);
  }

  private getFilePath(chainId: ChainId) {
    return path.join(this.dirPath, chainId + ".json");
  }

  private async save(chainId: ChainId) {
    await fs.writeFile(
      this.getFilePath(chainId),
      JSON.stringify(this.data[chainId.toString()], null, "  "),
    );
  }

  private async load(chainId: ChainId) {
    await this.checkContractAbisDir();
    const fileName = this.getFilePath(chainId);
    await this.checkFile(fileName);
    const rawData = await fs.readFile(fileName, { encoding: "utf-8" });
    this.data[chainId.toString()] = rawData ? JSON.parse(rawData) : {};
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
