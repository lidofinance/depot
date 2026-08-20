import fs from "node:fs/promises";
import path from "node:path";
import { Abi } from "abitype";
import { getAddress, isAddress } from "viem";

import { Address } from "../common/types";
import { NetworkName } from "../network";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";

export interface ResolvedAbi {
  abi: Abi;
  contractName: string;
  /** Provenance line written into the generated files. */
  source: string;
}

const ADDRESS_LIBRARIES: Partial<Record<NetworkName, string>> = {
  mainnet: "contracts/addresses/MainnetAddresses.sol",
  hoodi: "contracts/addresses/HoodiAddresses.sol",
};

export const deps = {
  resolveContractInfo: (networkName: NetworkName, address: Address) =>
    ContractInfoResolver.resolve(networkName, address),
  readFile: (filePath: string) => fs.readFile(filePath, "utf-8"),
};

/** Verified ABI of a deployed contract; proxies are followed one level down to the implementation. */
export async function fetchAbiFromEtherscan(networkName: NetworkName, address: Address): Promise<ResolvedAbi> {
  const info = await deps.resolveContractInfo(networkName, address);

  if (!info.implementation) {
    return { abi: info.abi, contractName: info.name, source: `Etherscan, ${networkName} ${address} (${info.name})` };
  }

  const implementation = await deps.resolveContractInfo(networkName, info.implementation);
  return {
    abi: implementation.abi,
    contractName: implementation.name,
    source:
      `Etherscan, ${networkName} ${address} (${info.name}) ` +
      `→ implementation ${info.implementation} (${implementation.name})`,
  };
}

/** Accepts a bare ABI array or a compiler artifact with an `abi` field. */
export async function readAbiFromFile(filePath: string): Promise<ResolvedAbi> {
  const parsed: unknown = JSON.parse(await deps.readFile(filePath));
  const abi = Array.isArray(parsed) ? parsed : (parsed as { abi?: unknown }).abi;

  if (!Array.isArray(abi)) {
    throw new Error(`File "${filePath}" contains neither an ABI array nor an artifact with an "abi" field`);
  }
  return { abi: abi as Abi, contractName: path.basename(filePath, path.extname(filePath)), source: `file ${filePath}` };
}

/** `StakingRouter` → constant `STAKING_ROUTER` of the per-network address library. */
export async function lookupAddressInRegistry(networkName: NetworkName, contractName: string): Promise<Address> {
  const libraryPath = ADDRESS_LIBRARIES[networkName];
  if (!libraryPath) {
    throw new Error(`No address registry for ${networkName} — pass the address explicitly`);
  }
  const constantName = toConstantName(contractName);

  let librarySource: string;
  try {
    librarySource = await deps.readFile(libraryPath);
  } catch {
    throw new Error(`No address registry for ${networkName} (${libraryPath}) — pass the address explicitly`);
  }

  const match = new RegExp(`address\\s+internal\\s+constant\\s+${constantName}\\s*=\\s*(0x[0-9a-fA-F]{40})\\s*;`).exec(
    librarySource,
  );
  if (!match) {
    throw new Error(`Constant "${constantName}" not found in ${libraryPath} — pass the address explicitly`);
  }
  return getAddress(match[1]);
}

export function parseAddress(value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`"${value}" is not a valid address`);
  }
  return getAddress(value);
}

export function toConstantName(contractName: string): string {
  return contractName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}
