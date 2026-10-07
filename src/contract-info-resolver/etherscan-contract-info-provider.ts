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

function isNotVerifiedMessage(message: string) {
  return message.toLowerCase().includes("contract source code not verified");
}

function describeMalformedResponse(text: string, response: Response) {
  const message = text.trim();
  const shortMessage = message.length > 300 ? `${message.slice(0, 300)}...` : message;
  return `Unexpected Etherscan response format (expected JSON, got ${response.status} ${response.statusText}): ${shortMessage}`;
}

class RateLimitError extends Error {
  constructor(msg: string) {
    super(`Rate limit reached, tried ${MAX_ATTEMPTS} times:\n${msg}`);
  }
}

class EtherscanUnavailableError extends Error {
  constructor(msg: string) {
    super(`Etherscan is unavailable, tried ${MAX_ATTEMPTS} times:\n${msg}`);
  }
}

type RetryReason = "rate limit" | "transient error";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

    let request: Response;
    try {
      request = await fetch(getSourceCodeUrl);
    } catch (error: unknown) {
      return this.retry(networkName, address, attempts, "transient error", errorMessage(error));
    }
    if (request.status === 429) {
      return this.retry(networkName, address, attempts, "rate limit", `HTTP 429 ${request.statusText}`);
    }
    if (request.status >= 500) {
      return this.retry(
        networkName,
        address,
        attempts,
        "transient error",
        `HTTP ${request.status} ${request.statusText}`,
      );
    }

    const text = await request.text();
    const response = this.parseEtherscanResponse(text, networkName, address);
    if (response === null) {
      return this.retry(networkName, address, attempts, "transient error", describeMalformedResponse(text, request));
    }

    if (response.message === "OK" && Array.isArray(response.result)) {
      const [contract] = response.result;
      if (!contract) {
        throw new Error(`Etherscan returned no contract info for ${networkName} ${address}`);
      }
      // Etherscan v2 answers "OK" for an unverified address and puts the notice into the ABI field.
      if (isNotVerifiedMessage(contract.ABI)) {
        throw new Error(`Contract is not verified: ${networkName} ${address}`);
      }
      return contract;
    }
    const result = response.result.toString();
    if (isRateLimitMessage(result)) {
      return this.retry(networkName, address, attempts, "rate limit", result);
    }
    if (isNotVerifiedMessage(result)) {
      throw new Error(`Contract is not verified: ${networkName} ${address}`);
    }
    if (result.toLowerCase().includes("api key")) {
      throw new Error(`Etherscan rejected the API key (ETHERSCAN_TOKEN): ${result}`);
    }
    throw new Error(`Unexpected Etherscan Response: ${JSON.stringify(response)}`);
  }

  private async retry(
    networkName: NetworkName,
    address: Address,
    attempts: number,
    reason: RetryReason,
    message: string,
  ): Promise<EtherscanGetSourceCodeResult> {
    if (attempts >= MAX_ATTEMPTS - 1) {
      throw reason === "rate limit" ? new RateLimitError(message) : new EtherscanUnavailableError(message);
    }
    await deps.sleep(Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS));
    return this.getContractInfo(networkName, address, attempts + 1);
  }

  /** `null` when the body is not JSON (an HTML error page from a proxy in front of Etherscan): the caller retries. */
  private parseEtherscanResponse(
    text: string,
    networkName: NetworkName,
    address: Address,
  ): EtherscanResponse<EtherscanGetSourceCodeResult[] | string> | null {
    try {
      return JSON.parse(text) as EtherscanResponse<EtherscanGetSourceCodeResult[] | string>;
    } catch {
      if (isNotVerifiedMessage(text)) {
        throw new Error(`Contract is not verified: ${networkName} ${address}`);
      }
      return null;
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
