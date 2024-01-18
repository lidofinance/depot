import fetch from "node-fetch";
import { ContractInfoProvider, Address, ChainId, ContractInfo } from "./types";
import bytes from "../common/bytes";

// TODO: Add support of Blockscout provider

// interface BlockscoutApiResponse {
//   abi?: string;
//   name?: string;
//   is_verified: boolean;
//   optimization_enabled: boolean;
//   optimizations_runs: number;
//   compiler_version: string;
//   evm_version: string;
//   source_code: string;
//   compiler_settings: Record<string, any>;
//   constructor_args: string;
//   language: "solidity" | "vyper" | "yul";
// }

// interface ExplorerChainConfig {
//   network: string;
//   chainId: number;
//   urls: {
//     apiURL: string;
//     browserURL?: string;
//   };
// }

// const BLOCKSCOUT_CHAINS: ExplorerChainConfig[] = [
//   {
//     network: "mainnet",
//     chainId: 1,
//     urls: {
//       apiURL: "https://eth.blockscout.com/api/v2",
//       browserURL: "https://eth.blockscout.com",
//     },
//   },
// ];

// interface BlockchainAbiProviderOptions {
//   apiKey?: string;
//   chains?: ExplorerChainConfig[];
// }

// export class BlockscoutAbiProvider implements ContractInfoProvider {
//   private readonly apiKey?: string;
//   private readonly chains: ExplorerChainConfig[] = [];

//   constructor(options: BlockchainAbiProviderOptions = {}) {
//     this.apiKey = options.apiKey;
//     this.chains = options.chains ?? [];
//   }

//   public async request(chainId: ChainId, address: Address): Promise<ContractInfo> {
//     const response = await fetch(this.getRequestUrl(chainId, address));
//     const result: BlockscoutApiResponse = await response.json();
//     if (!result.abi) {
//       throw new Error(`The contract is not verified`);
//     }
//     return {
//       abi: JSON.parse(result.abi),
//       name: result.name || "Untitled",
//       language: result.language,
//       isProxy: result.optimization_enabled,
//       constructorArgs: bytes.normalize(result.constructor_args),
//       compiler: {
//         version: result.compiler_version,
//         evmVersion: result.evm_version,
//         settings: result.compiler_settings,
//       },
//     };
//   }

//   private getRequestUrl(chainId: ChainId, address: Address) {
//     const config =
//       this.chains.find((chain) => chain.chainId === Number(chainId)) ??
//       BLOCKSCOUT_CHAINS.find((chain) => chain.chainId === Number(chainId));
//     if (!config) {
//       throw new Error(`Unsupported chain id ${chainId}. Please, try to add custom network.`);
//     }
//     return `https://${config.urls.apiURL}.blockscout.com/api/v2/smart-contracts/${address}`;
//   }
// }
