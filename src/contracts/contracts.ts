import { Abi, AbiEvent, AbiFunction, Address, getAbiItem } from "viem";
import bytes from "../common/bytes";
import { FilterAbiEvents, FilterAbiFunctions } from "../types/abi.types";
import { NetworkName } from "../network";
import * as env from "../common/env";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";
import { EtherscanContractInfoProvider } from "../contract-info-resolver/etherscan-contract-info-provider";

import { LidoMainnetConfig, LIDO_ON_MAINNET } from "../../configs/lido.mainnet";
import { LidoHoleskyConfig, LIDO_ON_HOLESKY } from "../../configs/lido.holesky";

export interface Contract<T extends Abi = Abi, A extends Address = Address> {
  abi: T;
  address: A;
  label: string;
}

export type LidoImpls<N extends NetworkName = NetworkName> = N extends "mainnet"
  ? ContractImpls<LidoMainnetConfig>
  : N extends "holesky"
    ? ContractImpls<LidoHoleskyConfig>
    : never;

export type LidoProxies<N extends NetworkName = NetworkName> = N extends "mainnet"
  ? ContractProxies<LidoMainnetConfig>
  : N extends "holesky"
    ? ContractProxies<LidoHoleskyConfig>
    : never;

export type LidoContracts<N extends NetworkName = NetworkName> = N extends "mainnet"
  ? ContractInstances<LidoMainnetConfig>
  : N extends "holesky"
    ? ContractInstances<LidoHoleskyConfig>
    : never;

type ContractInstances<T extends ContractsMap> = {
  [K in keyof T]: T[K] extends ContractConfig
    ? Contract<T[K]["abi"], T[K]["address"]>
    : T[K] extends ProxiedContractConfig
      ? Contract<T[K]["impl"]["abi"], T[K]["proxy"]["address"]>
      : T[K] extends ContractsMap
        ? ContractInstances<T[K]>
        : never;
};

type ContractProxies<T extends ContractsMap> = {
  [K in keyof T as T[K] extends ProxiedContractConfig | ContractsMap ? K : never]: T[K] extends ProxiedContractConfig
    ? Contract<T[K]["proxy"]["abi"], T[K]["proxy"]["address"]>
    : T[K] extends ContractsMap
      ? ContractProxies<T[K]>
      : never;
};

type ContractImpls<T extends ContractsMap> = {
  [K in keyof T as T[K] extends ProxiedContractConfig | ContractsMap ? K : never]: T[K] extends ProxiedContractConfig
    ? Contract<T[K]["impl"]["abi"], T[K]["impl"]["address"]>
    : T[K] extends ContractsMap
      ? ContractImpls<T[K]>
      : never;
};

interface ContractConfig {
  abi: Abi;
  label?: string;
  address: Address;
}

type ProxiedContractConfig = {
  impl: Omit<ContractConfig, "label">;
  proxy: Omit<ContractConfig, "label">;
  label?: string;
};

interface ContractsMap {
  [key: string]: ContractConfig | ProxiedContractConfig | ContractsMap;
}

// ---
// Public Methods
// ---

export function getLidoContracts<N extends NetworkName>(network: N) {
  if (network === "mainnet") {
    return buildInstances(LIDO_ON_MAINNET) as LidoContracts<N>;
  }
  if (network === "holesky") {
    return buildInstances(LIDO_ON_HOLESKY) as LidoContracts<N>;
  }
  throw new Error("Unsupported network");
}

export function getLidoProxies<N extends NetworkName>(network: N) {
  if (network === "mainnet") {
    return buildProxies(LIDO_ON_MAINNET) as LidoProxies<N>;
  }
  if (network === "holesky") {
    return buildProxies(LIDO_ON_HOLESKY) as LidoProxies<N>;
  }
  throw new Error("Unsupported network");
}

export function getLidoImpls<N extends NetworkName>(network: N) {
  if (network === "mainnet") {
    return buildImpls(LIDO_ON_MAINNET) as LidoImpls<N>;
  }
  if (network === "holesky") {
    return buildImpls(LIDO_ON_HOLESKY) as LidoImpls<N>;
  }
  throw new Error("Unsupported network");
}

// Single contract may have a couple associated contracts if it's proxy
export async function resolveContract(network: NetworkName, address: Address): Promise<Contract[]> {
  const locallyResolved: Contract[] = [];

  const impls = getLidoImpls(network);

  for (const impl of Object.values(impls)) {
    if (bytes.isEqual(impl.address, address)) {
      locallyResolved.push(impl);
      break;
    }
  }

  const contracts = getLidoContracts(network);

  for (const contract of Object.values(contracts)) {
    if (bytes.isEqual(contract.address, address)) {
      locallyResolved.push(contract);
      break;
    }
  }

  const proxies = getLidoProxies(network);

  for (const proxy of Object.values(proxies)) {
    if (bytes.isEqual(proxy.address, address)) {
      locallyResolved.push(proxy);
      break;
    }
  }

  if (locallyResolved.length > 0) {
    return locallyResolved;
  }

  const etherscanToken = env.ETHERSCAN_TOKEN();
  const etherscanCacheEnabled = env.ETHERSCAN_CACHE_ENABLED();

  if (!etherscanToken) {
    throw new Error("ETHERSCAN_TOKEN env variable not set");
  }

  const contractInfoResolver = new ContractInfoResolver(
    {
      contractInfoProvider: new EtherscanContractInfoProvider(etherscanToken),
    },
    etherscanCacheEnabled,
  );

  const resolvedContract = await contractInfoResolver.resolve(network, address);
  const implAddress = resolvedContract.implementation;

  if (!implAddress) {
    return [{ address, abi: resolvedContract.abi, label: getInstanceLabel(resolvedContract.name) }];
  }

  const resolvedContractImpl = await contractInfoResolver.resolve(network, implAddress);

  return [
    { address, abi: resolvedContractImpl.abi, label: getProxyLabel(resolvedContractImpl.name) },
    { address, abi: resolvedContract.abi, label: getProxyLabel(resolvedContractImpl.name) },
  ];
}

// TODO: add support for overloaded events
export function getEventAbi<T extends Pick<Contract, "abi">>(
  contract: T,
  eventName: FilterAbiEvents<T["abi"]>["name"],
): AbiEvent {
  const abi = getAbiItem({ abi: contract.abi as unknown[], name: eventName as string });
  if (!abi) {
    throw new Error(`Event with name ${eventName} not found`);
  }
  if (abi.type !== "event") {
    throw new Error(`abi element is not "event" type`);
  }
  return abi;
}

export function getFunctionAbi<T extends Pick<Contract, "abi">>(
  contract: T,
  functionName: FilterAbiFunctions<T["abi"]>["name"],
  args?: unknown[] | readonly unknown[],
): AbiFunction {
  const abi = getAbiItem({ abi: contract.abi as unknown[], name: functionName as string, args });
  if (!abi) {
    throw new Error(`Event with name ${functionName} not found`);
  }
  if (abi.type !== "function") {
    throw new Error(`abi element is not "event" type`);
  }
  return abi;
}

export function buildInstances<T extends ContractsMap>(config: T): ContractInstances<T> {
  const res = {} as any;

  for (const [key, value] of Object.entries(config)) {
    if (isProxiedContract(value)) {
      res[key] = {
        abi: value.impl.abi,
        address: bytes.normalize(value.proxy.address),
        label: getProxyLabel(value.label ?? key),
      };
    } else if (isContract(value)) {
      res[key] = {
        abi: value.abi,
        address: bytes.normalize(value.address),
        label: getInstanceLabel(value.label ?? key),
      };
    } else if (isContractsConfig(value)) {
      res[key] = buildInstances(value);
    }
  }

  return res;
}

export function buildProxies<T extends ContractsMap>(config: T): ContractProxies<T> {
  const res = {} as any;

  for (const [key, value] of Object.entries(config)) {
    if (isProxiedContract(value)) {
      res[key] = {
        abi: value.proxy.abi,
        address: bytes.normalize(value.proxy.address),
        label: getProxyLabel(value.label ?? key),
      };
    } else if (isContractsConfig(value)) {
      const nested = buildProxies(value);
      if (Object.keys(nested).length > 0) {
        res[key] = nested;
      }
    }
  }

  return res;
}

export function buildImpls<T extends ContractsMap>(config: T): ContractImpls<T> {
  const res = {} as any;

  for (const [key, value] of Object.entries(config)) {
    if (isProxiedContract(value)) {
      res[key] = {
        abi: value.impl.abi,
        address: bytes.normalize(value.impl.address),
        label: getImplLabel(value.label ?? key),
      };
    } else if (isContractsConfig(value)) {
      const nested = buildImpls(value);
      if (Object.keys(nested).length > 0) {
        res[key] = nested;
      }
    }
  }

  return res;
}

// ---
// Private Methods
// ---

function getInstanceLabel(contractLabel: string) {
  return contractLabel.charAt(0).toUpperCase() + contractLabel.slice(1);
}

function getProxyLabel(contractLabel: string) {
  return getInstanceLabel(contractLabel) + "__Proxy";
}

function getImplLabel(contractLabel: string) {
  return getInstanceLabel(contractLabel) + "__Impl";
}

function isContract(value: unknown): value is Contract {
  // prettier-ignore
  return (
    !!value &&
    typeof value === "object" &&
    ("abi" in value && Array.isArray(value.abi)) &&
    ("address" in value && typeof value.address === "string")
  );
}

function isProxiedContract(value: unknown): value is ProxiedContractConfig {
  // prettier-ignore
  return (
    !!value &&
    typeof value === "object" &&
    ("impl" in value && isContract(value.impl)) &&
    ("proxy" in value && isContract(value.proxy))
  );
}

function isContractsConfig(value: unknown): value is ContractsMap {
  if (!value || typeof value !== "object") return false;

  if (isProxiedContract(value) || isContract(value)) {
    return false;
  }

  return true;
}
