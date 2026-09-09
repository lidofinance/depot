import fs from "node:fs/promises";
import path from "node:path";
import { Abi } from "abitype";
import { getAddress, isAddress } from "viem";

import bytes, { HexStrPrefixed } from "../common/bytes";
import { Address } from "../common/types";
import { createRpcClient, NetworkName, RpcClient } from "../network";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";
import { ContractInfo } from "../contract-info-resolver/types";
import { validateAbi } from "./validate-abi";

export interface ResolvedAbi {
  abi: Abi;
  contractName: string;
  /** Provenance line written into the generated files. */
  source: string;
}

export interface FetchAbiOptions {
  /** Return the proxy's own ABI instead of following it to the implementation. */
  proxyAbi?: boolean;
}

const ADDRESS_LIBRARIES: Partial<Record<NetworkName, string>> = {
  mainnet: "contracts/addresses/MainnetAddresses.sol",
  hoodi: "contracts/addresses/HoodiAddresses.sol",
};

const MAX_PROXY_DEPTH = 3;
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const IMPLEMENTATION_SELECTOR = "0x5c60da1b";
const PROXY_ABI_MARKERS = new Set(["proxy__getImplementation", "proxy__upgradeTo"]);

type ChainReader = Pick<RpcClient, "send">;

export const deps = {
  resolveContractInfo: (networkName: NetworkName, address: Address) =>
    ContractInfoResolver.resolve(networkName, address),
  readImplementationOnChain: (networkName: NetworkName, address: Address, callImplementationGetter: boolean) =>
    readImplementationOnChain(networkName, address, callImplementationGetter),
  createRpcClient: (networkName: NetworkName): Promise<ChainReader> => createRpcClient(networkName),
  rpcClients: new Map<NetworkName, Promise<ChainReader>>(),
  readFile: (filePath: string) => fs.readFile(filePath, "utf-8"),
};

/**
 * Verified ABI of a deployed contract. A proxy is followed to the implementation read from the chain
 * (EIP-1967 implementation or beacon slot, then a legacy `implementation()` fallback); Etherscan's
 * own "Implementation" field is never used for that, because it is not refreshed after an upgrade.
 */
export async function fetchAbiFromEtherscan(
  networkName: NetworkName,
  address: Address,
  options: FetchAbiOptions = {},
): Promise<ResolvedAbi> {
  const info = await deps.resolveContractInfo(networkName, address);
  let source = `Etherscan, ${networkName} ${address} (${info.name})`;

  if (options.proxyAbi) {
    return { abi: info.abi, contractName: info.name, source: `${source}, proxy ABI` };
  }

  let current = { address, info };
  const visited = new Set([address.toLowerCase()]);
  for (let depth = 0; depth < MAX_PROXY_DEPTH; depth++) {
    const implementation = await resolveImplementation(networkName, current.address, current.info);
    if (!implementation) {
      return { abi: current.info.abi, contractName: current.info.name, source };
    }
    if (visited.has(implementation.toLowerCase())) {
      throw new Error(`Proxy chain of ${address} on ${networkName} loops back to ${implementation}`);
    }
    visited.add(implementation.toLowerCase());

    const implementationInfo = await resolveImplementationInfo(networkName, current.address, implementation);
    source += ` → implementation ${implementation} (${implementationInfo.name})`;
    current = { address: implementation, info: implementationInfo };
  }
  throw new Error(`Proxy chain of ${address} on ${networkName} is deeper than ${MAX_PROXY_DEPTH} levels`);
}

async function resolveImplementation(
  networkName: NetworkName,
  address: Address,
  info: ContractInfo,
): Promise<Address | null> {
  const proxyLike = looksLikeProxy(info);
  const implementation = await deps.readImplementationOnChain(networkName, address, proxyLike);
  if (!implementation && proxyLike) {
    throw new Error(
      `${address} on ${networkName} (${info.name}) looks like a proxy, but exposes no implementation on chain ` +
        `— pass --from-file with the implementation ABI, or --proxyAbi for the proxy's own ABI`,
    );
  }
  return implementation;
}

async function resolveImplementationInfo(
  networkName: NetworkName,
  proxy: Address,
  implementation: Address,
): Promise<ContractInfo> {
  try {
    return await deps.resolveContractInfo(networkName, implementation);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("not verified")) {
      throw error;
    }
    throw new Error(
      `Implementation ${implementation} of proxy ${proxy} on ${networkName} is not verified ` +
        `— pass --from-file with the implementation ABI, or --proxyAbi for the proxy's own ABI`,
    );
  }
}

/** Etherscan flagged it, its name is a known proxy, or its ABI has nothing but proxy plumbing. */
function looksLikeProxy(info: ContractInfo): boolean {
  if (info.implementation || /proxy/i.test(info.name)) {
    return true;
  }
  const functions = info.abi.filter((item) => item.type === "function");
  return functions.length === 0 || info.abi.some((item) => "name" in item && PROXY_ABI_MARKERS.has(item.name));
}

/**
 * EIP-1967 implementation and beacon slots first, then `implementation()` for Aragon proxies.
 * `null` when the contract exposes neither; an RPC failure is an error, never a silent miss.
 */
export async function readImplementationOnChain(
  networkName: NetworkName,
  address: Address,
  callImplementationGetter: boolean,
): Promise<Address | null> {
  const client = await getRpcClient(networkName, address);

  const slot = await client.send<string, unknown[], HexStrPrefixed>("eth_getStorageAt", [
    address,
    EIP1967_IMPLEMENTATION_SLOT,
    "latest",
  ]);
  const fromSlot = addressFromWord(slot);
  if (fromSlot) {
    return fromSlot;
  }

  const beaconSlot = await client.send<string, unknown[], HexStrPrefixed>("eth_getStorageAt", [
    address,
    EIP1967_BEACON_SLOT,
    "latest",
  ]);
  const beacon = addressFromWord(beaconSlot);
  if (beacon) {
    return readImplementationGetter(client, beacon);
  }
  if (!callImplementationGetter) {
    return null;
  }

  return readImplementationGetter(client, address);
}

async function readImplementationGetter(client: ChainReader, address: Address): Promise<Address | null> {
  try {
    const word = await client.send<string, unknown[], HexStrPrefixed>("eth_call", [
      { to: address, data: IMPLEMENTATION_SELECTOR },
      "latest",
    ]);
    return addressFromWord(word);
  } catch (error: unknown) {
    if (isExecutionRevert(error)) {
      return null;
    }
    throw error;
  }
}

async function getRpcClient(networkName: NetworkName, address: Address): Promise<ChainReader> {
  let client = deps.rpcClients.get(networkName);
  if (!client) {
    client = deps.createRpcClient(networkName);
    // A failed connection must not poison the cache for the rest of the run.
    client.catch(() => deps.rpcClients.delete(networkName));
    deps.rpcClients.set(networkName, client);
  }
  try {
    return await client;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`No ${networkName} RPC to read the implementation of ${address} from the chain: ${message}`);
  }
}

function isExecutionRevert(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : "";
  return code === 3 || /revert|execution error|invalid opcode/i.test(message);
}

export function addressFromWord(word: string): Address | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(word)) {
    return null;
  }
  const address = bytes.normalize(`0x${word.slice(-40)}`);
  return /^0x0{40}$/.test(address) ? null : getAddress(address);
}

/** Accepts a bare ABI array or a compiler artifact with an `abi` field. */
export async function readAbiFromFile(filePath: string): Promise<ResolvedAbi> {
  const content = await deps.readFile(filePath);
  try {
    const parsed: unknown = JSON.parse(content);
    const abi = typeof parsed === "object" && parsed !== null && "abi" in parsed ? parsed.abi : parsed;
    validateAbi(abi);
    return { abi, contractName: path.basename(filePath, path.extname(filePath)), source: `file ${filePath}` };
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw Object.assign(new Error(`Invalid ABI file "${filePath}": ${message}`), { cause });
  }
}

/** `StakingRouter` → constant `STAKING_ROUTER` of the per-network address library. */
export async function lookupAddressInRegistry(
  networkName: NetworkName,
  contractName: string,
  projectRoot: string,
): Promise<Address> {
  const library = ADDRESS_LIBRARIES[networkName];
  if (!library) {
    throw new Error(`No address registry for ${networkName} — pass the address explicitly`);
  }
  const libraryPath = path.join(projectRoot, library);
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
