import fetch from "node-fetch";

import { BUILTIN_ETHERSCAN_CHAINS, EtherscanChainConfig } from "./etherscan-chains-config";
import { NamedContractData, NamedContractDataResolver } from "./types";
import bytes from "../common/bytes";
import { ChainId } from "../common/types";

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

export class EtherscanContractDataResolver implements NamedContractDataResolver {
  private readonly chains: EtherscanChainConfig[];
  private readonly etherscanToken: string;

  private apiUrl(chainId: ChainId) {
    for (let config of this.chains) {
      if (config.chainId.toString() === chainId.toString()) {
        return config.urls.apiURL;
      }
    }
    throw new Error(`Unsupported chain id "${chainId}"`);
  }

  constructor(etherscanToken: string, customChains: EtherscanChainConfig[] = []) {
    this.etherscanToken = etherscanToken;
    this.chains = [...customChains, ...BUILTIN_ETHERSCAN_CHAINS];
  }

  async resolve(chainId: ChainId, address: Address): Promise<NamedContractData | null> {
    const sourceCode = await this.getContractSourceCode(chainId, address);
    if (!sourceCode || sourceCode.ABI === "Contract source code not verified") return null;

    return {
      name: sourceCode.ContractName,
      abi: JSON.parse(sourceCode.ABI),
      isProxy: sourceCode.Proxy === "1",
      implementation:
        sourceCode.Implementation === "" ? undefined : bytes.normalize(sourceCode.Implementation),
    };
  }

  private async getContractSourceCode(
    chainId: ChainId,
    address: Address
  ): Promise<EtherscanGetSourceCodeResult | undefined> {
    const getSourceCodeUrl =
      this.apiUrl(chainId) +
      "?" +
      [
        "module=contract",
        "action=getsourcecode",
        `address=${address}`,
        `apikey=${this.etherscanToken}`,
      ].join("&");

    const request = await fetch(getSourceCodeUrl);
    const response = (await request.json()) as EtherscanResponse<
      EtherscanGetSourceCodeResult[] | string
    >;

    if (response.status === "0") {
      if (response.result === "Contract source code not verified") {
        return undefined;
      }
      throw new Error(`Etherscan request failed: ${response}`);
    }
    if (response.status === "1" && Array.isArray(response.result)) {
      return response.result[0];
    }
    return undefined;
  }
}
