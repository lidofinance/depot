import fetch from "node-fetch";

import { ContractInfoProvider, ContractInfo } from "./types";

import bytes from "helpers/bytes";
import { Address, ChainId } from "helpers/types";
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

  private apiUrl(chainId: ChainId): [url: string | null, err: string | null] {
    for (let config of this.chains) {
      if (config.chainId.toString() === chainId.toString()) {
        return [config.urls.apiURL, null];
      }
    }
    return [null, `Unsupported chain id "${chainId}"`];
  }

  constructor(etherscanToken: string, customChains: EtherscanChainConfig[] = []) {
    this.etherscanToken = etherscanToken;
    this.chains = [...customChains, ...BUILTIN_ETHERSCAN_CHAINS];
  }

  async request(chainId: ChainId, address: Address): Promise<[res: ContractInfo | null, err: null | string]> {
    const [res, err] = await this.getContractInfo(chainId, address);
    if (err !== null) {
      return [null, err];
    }

    return [
      {
        name: res.ContractName,
        abi: JSON.parse(res.ABI),
        implementation: res.Implementation === "" ? null : bytes.normalize(res.Implementation),
        constructorArgs: bytes.normalize(res.ConstructorArguments ?? ""),
        evmVersion: res.EVMVersion,
        sourceCode: this.processSourceCode(res),
        compilerVersion: res.CompilerVersion,
      },
      null,
    ];
  }

  private async getContractInfo(
    chainId: ChainId,
    address: Address,
  ): Promise<[res: EtherscanGetSourceCodeResult, error: null]>;
  private async getContractInfo(chainId: ChainId, address: Address): Promise<[res: null, error: string]>;
  private async getContractInfo(
    chainId: ChainId,
    address: Address,
  ): Promise<[res: EtherscanGetSourceCodeResult | null, error: string | null]> {
    const [apiUrl, error] = this.apiUrl(chainId);
    if (error) return [null, error];
    const getSourceCodeUrl =
      apiUrl +
      "?" +
      ["module=contract", "action=getsourcecode", `address=${address}`, `apikey=${this.etherscanToken}`].join("&");

    const request = await fetch(getSourceCodeUrl);
    const response = (await request.json()) as EtherscanResponse<EtherscanGetSourceCodeResult[] | string>;

    if (response.status === "0" && response.result === "Contract source code not verified") {
      return [null, "Contract is not verified"];
    } else if (response.status === "1" && Array.isArray(response.result)) {
      return [response.result[0], null];
    }
    return [null, `Unexpected Etherscan Response: ${JSON.stringify(response)}`];
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
