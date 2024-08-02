import fetch from "node-fetch";

import { ContractInfoProvider, ContractInfo } from "./types";

import bytes from "../common/bytes";
import { Address, ChainId } from "../common/types";
import { BUILTIN_ETHERSCAN_CHAINS, EtherscanChainConfig } from "./etherscan-chains-config";

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

export class EtherscanContractInfoProvider implements ContractInfoProvider {
  private readonly chains: EtherscanChainConfig[];
  private readonly etherscanToken: string;

  private apiUrl(chainId: ChainId): string {
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

  async request(chainId: ChainId, address: Address): Promise<ContractInfo> {
    const res = await this.getContractInfo(chainId, address);

    return {
      name: res.ContractName,
      abi: JSON.parse(res.ABI),
      implementation: res.Implementation === "" ? null : bytes.normalize(res.Implementation),
      constructorArgs: bytes.normalize(res.ConstructorArguments ?? ""),
      evmVersion: res.EVMVersion,
      sourceCode: this.processSourceCode(res),
      compilerVersion: res.CompilerVersion,
    };
  }

  private async getContractInfo(chainId: ChainId, address: Address): Promise<EtherscanGetSourceCodeResult> {
    const apiUrl = this.apiUrl(chainId);

    const getSourceCodeUrl = new URL(apiUrl);
    const params = new URLSearchParams({
      module: "contract",
      action: "getsourcecode",
      address: address,
      apikey: this.etherscanToken,
    });
    getSourceCodeUrl.search = params.toString();

    const request = await fetch(getSourceCodeUrl);
    const response = (await request.json()) as EtherscanResponse<EtherscanGetSourceCodeResult[] | string>;

    if (response.status === "0" && response.result === "Contract source code not verified") {
      throw new Error("Contract is not verified");
    } else if (response.status === "1" && Array.isArray(response.result)) {
      return response.result[0];
    }
    throw new Error(`Unexpected Etherscan Response: ${JSON.stringify(response)}`);
  }

  private processSourceCode(response: EtherscanGetSourceCodeResult): string {
    const rawSourceCode = response.SourceCode;
    if (this.isVyperContract(response)) {
      return response.SourceCode;
    }
    if (this.isStandardJsonInputSourceCode(response)) {
      return rawSourceCode.substring(1, rawSourceCode.length - 1);
    }
    if (this.isMultipartFiles(response)) {
      // When the source files were uploaded as multipart data, the compiler
      // options is not specified, so use default for unknown properties
      return JSON.stringify({
        language: "Solidity",
        sources: response.SourceCode,
        settings: {
          libraries: {},
          outputSelection: {
            "*": {
              "": ["ast"],
              "*": ["metadata", "evm.bytecode", "evm.bytecode.sourceMap"],
            },
          },
          evmVersion: response.EVMVersion,
          optimizer: { enabled: response.OptimizationUsed === "1", runs: response.Runs },
        },
      });
    }
    // in other cases consider it's as a flattened contract
    return JSON.stringify({
      language: "Solidity",
      sources: {
        [response.ContractName + ".sol"]: response.SourceCode,
      },
      settings: {
        libraries: {},
        outputSelection: {
          "*": {
            "": ["ast"],
            "*": ["metadata", "evm.bytecode", "evm.bytecode.sourceMap"],
          },
        },
        evmVersion: response.EVMVersion,
        optimizer: { enabled: response.OptimizationUsed === "1", runs: response.Runs },
      },
    });
  }

  private isStandardJsonInputSourceCode(response: EtherscanGetSourceCodeResult) {
    return response.SourceCode.startsWith("{{");
  }

  private isVyperContract(response: EtherscanGetSourceCodeResult) {
    return response.CompilerVersion.toLowerCase().startsWith("vyper");
  }

  private isMultipartFiles(response: EtherscanGetSourceCodeResult) {
    return response.SourceCode.startsWith("{");
  }
}
