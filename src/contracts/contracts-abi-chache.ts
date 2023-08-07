import path from "path";
import fs from "fs/promises";

import { ContractAbi, ContractAbiCache } from "./types";

export class ContractAbiMemoryCache implements ContractAbiCache {
  private data: Record<NetworkName, Record<Address, ContractAbi>> = {
    goerli: {},
    mainnet: {},
    sepolia: {},
  };

  async get(network: NetworkName, address: Address) {
    return this.data[network][address] || null;
  }

  async set(network: NetworkName, address: Address, abi: ContractAbi) {
    this.data[network][address] = abi;
  }
}

export class ContractAbiJsonCache implements ContractAbiCache {
  private static instances: Record<string, ContractAbiJsonCache> = {};

  public static create(dirPath: string) {
    if (!this.instances[dirPath]) {
      this.instances[dirPath] = new ContractAbiJsonCache(dirPath);
    }
    return this.instances[dirPath];
  }

  private dirPath: string;
  private data: Partial<Record<NetworkName, Record<Address, ContractAbi>>> = {};

  private constructor(dirPath: string) {
    this.dirPath = dirPath;
  }

  async get(network: NetworkName, address: Address) {
    if (!this.data[network]) {
      await this.load(network);
    }
    const networkData = this.data[network]!;
    return networkData[address] || null;
  }

  async set(network: NetworkName, address: Address, abi: ContractAbi) {
    if (!this.data[network]) {
      await this.load(network);
    }
    const networkData = this.data[network];
    if (!networkData) {
      throw new Error("Network data wasn't loaded before write");
    }
    networkData[address] = abi;
    await this.save(network);
  }

  private getFilePath(network: NetworkName) {
    return path.join(this.dirPath, network + ".json");
  }

  private async save(network: NetworkName) {
    await fs.writeFile(this.getFilePath(network), JSON.stringify(this.data[network], null, "  "));
  }

  private async load(network: NetworkName) {
    await this.checkContractAbisDir();
    const fileName = this.getFilePath(network);
    await this.checkFile(fileName);
    const rawData = await fs.readFile(fileName, { encoding: "utf-8" });
    this.data[network] = rawData ? JSON.parse(rawData) : {};
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
