import { ContractInfoProvider, ContractInfo } from "./types";

import bytes from "../common/bytes";
import { Address } from "../common/types";
import { getChainIdByNetworkName, NetworkName } from "../network";

interface EtherscanResponse<T = unknown> {
  status: "0" | "1";
  message: "OK" | "NOTOK";
  result: T;
}

export const MAX_ATTEMPTS = 6;
// Etherscan free tier is 5 req/s; back off 0.5s, 1s, 2s, 4s, 8s.
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

export const deps = {
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function isRateLimitMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("max calls per sec");
}

class RateLimitError extends Error {
  constructor(msg: string) {
    super(`Rate limit reached, tried ${MAX_ATTEMPTS} times:\n${msg}`);
  }
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
  private readonly etherscanToken: string;

  constructor(etherscanToken: string) {
    this.etherscanToken = etherscanToken;
  }

  async request(network: NetworkName, address: Address): Promise<ContractInfo> {
    const res = await this.getContractInfo(network, address);

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

  private async getContractInfo(
    networkName: NetworkName,
    address: Address,
    attempts: number = 0,
  ): Promise<EtherscanGetSourceCodeResult> {
    const getSourceCodeUrl = `https://api.etherscan.io/v2/api?${new URLSearchParams({
      chainid: getChainIdByNetworkName(networkName).toString(),
      action: "getsourcecode",
      module: "contract",
      address: address,
      apikey: this.etherscanToken,
    }).toString()}`;

    const request = await fetch(getSourceCodeUrl);
    if (request.status === 429) {
      return this.retryAfterRateLimit(networkName, address, attempts, `HTTP 429 ${request.statusText}`);
    }
    const response = await this.parseEtherscanResponse(request);

    if (response.message === "OK" && Array.isArray(response.result)) {
      return response.result[0];
    }
    if (isRateLimitMessage(response.result.toString())) {
      return this.retryAfterRateLimit(networkName, address, attempts, response.result.toString());
    }
    if (response.result.toString().toLowerCase().includes("contract source code not verified")) {
      throw new Error("Contract is not verified");
    }
    throw new Error(`Unexpected Etherscan Response: ${JSON.stringify(response)}`);
  }

  private async retryAfterRateLimit(
    networkName: NetworkName,
    address: Address,
    attempts: number,
    message: string,
  ): Promise<EtherscanGetSourceCodeResult> {
    if (attempts >= MAX_ATTEMPTS - 1) {
      throw new RateLimitError(message);
    }
    await deps.sleep(Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS));
    return this.getContractInfo(networkName, address, attempts + 1);
  }

  private async parseEtherscanResponse(
    response: Response,
  ): Promise<EtherscanResponse<EtherscanGetSourceCodeResult[] | string>> {
    const text = await response.text();

    try {
      return JSON.parse(text) as EtherscanResponse<EtherscanGetSourceCodeResult[] | string>;
    } catch {
      const message = text.trim();
      if (message.toLowerCase().includes("contract source code not verified")) {
        throw new Error("Contract is not verified");
      }

      const shortMessage = message.length > 300 ? `${message.slice(0, 300)}...` : message;
      throw new Error(
        `Unexpected Etherscan response format (expected JSON, got ${response.status} ${response.statusText}): ${shortMessage}`,
      );
    }
  }

  private processSourceCode(response: EtherscanGetSourceCodeResult): string {
    const rawSourceCode = response.SourceCode;
    if (this.isVyperContract(response)) {
      return JSON.stringify({
        language: "Vyper",
        sources: response.SourceCode,
        // TODO: add real settings
        settings: {
          libraries: {},
          outputSelection: {},
        },
        evmVersion: response.EVMVersion,
        optimizer: { enabled: response.OptimizationUsed === "1", runs: response.Runs },
      });
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
