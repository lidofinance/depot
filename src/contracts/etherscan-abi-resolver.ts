import fetch from "node-fetch";

import { ContractAbiResolver } from "./types";

interface EtherscanResponse<T = unknown> {
  status: "0" | "1";
  message: "OK" | "NOTOK";
  result: T;
}

interface EtherscanGetSourceCodeResult {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: "1" | "0";
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: "0" | "1";
  Implementation: string;
  SwarmSource: string;
}

export class EtherscanLabeledAbiResolver implements ContractAbiResolver {
  private readonly etherscanToken: string;

  private baseApiUrl(network: NetworkName) {
    switch (network) {
      case "mainnet":
        return "https://api.etherscan.io/api";
      case "goerli":
        return "https://api-goerli.etherscan.io/api";
      case "sepolia":
        return "https://api-sepolia.etherscan.io/api";
      default:
        throw new Error(`Unsupported network "${network}"`);
    }
  }

  constructor(etherscanToken: string) {
    this.etherscanToken = etherscanToken;
  }

  async resolve(network: NetworkName, address: Address) {
    const sourceCode = await this.getContractSourceCode(network, address);
    if (!sourceCode || sourceCode.ABI === "Contract source code not verified") return null;

    return {
      name: sourceCode.ContractName,
      abi: JSON.parse(sourceCode.ABI),
      isProxy: sourceCode.Proxy === "1",
      implementation: sourceCode.Implementation === "" ? undefined : sourceCode.Implementation,
    };
  }

  private async getContractSourceCode(
    network: NetworkName,
    address: Address,
  ): Promise<EtherscanGetSourceCodeResult | undefined> {
    const getSourceCodeUrl =
      this.baseApiUrl(network) +
      "?" +
      [
        "module=contract",
        "action=getsourcecode",
        `address=${address}`,
        `apikey=${this.etherscanToken}`,
      ].join("&");

    const request = await fetch(getSourceCodeUrl);
    const response: EtherscanResponse<EtherscanGetSourceCodeResult[] | string> =
      await request.json();

    if (response.status === "0") {
      if (response.result === "Contract source code not verified") {
        return undefined;
      }
      throw new Error(`Unexpected response status ${response.status}`);
    }
    if (response.status === "1" && Array.isArray(response.result)) {
      return response.result[0];
    }
  }
}
