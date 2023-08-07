import { BaseContract, ContractRunner } from "ethers";
import env from "../common/env";
import { CONTRACTS_ABI_CACHE_PATH } from "../constants";
import { ContractsConfig, FactoryAddressTuple, LabeledContract } from "./types";
import { LabeledContractBuilder } from "./labeled-contract";
import { CachedContractsResolver } from "./contracts-resolver";
import { ContractAbiJsonCache } from "./contracts-abi-chache";
import { EnvVariableMissingError } from "../common/errors";
import { EtherscanLabeledAbiResolver } from "./etherscan-abi-resolver";

export type Contracts<T extends ContractsConfig> = {
  [K in keyof T]: LabeledContract<ReturnType<T[K]["impl"][0]["connect"]>>;
};

export type Proxies<T extends ContractsConfig> = {
  [K in keyof T as T[K]["proxy"] extends FactoryAddressTuple
    ? K
    : never]: T[K]["proxy"] extends FactoryAddressTuple
    ? LabeledContract<ReturnType<T[K]["proxy"][0]["connect"]>>
    : never;
};

export type Implementations<T extends ContractsConfig> = {
  [K in keyof T as T[K]["proxy"] extends FactoryAddressTuple
    ? K
    : never]: T[K]["proxy"] extends FactoryAddressTuple
    ? LabeledContract<ReturnType<T[K]["impl"][0]["connect"]>>
    : never;
};

export type Protocol<T extends ContractsConfig> = {
  contracts: Contracts<T> & {
    proxies: Proxies<T>;
    implementations: Implementations<T>;
  };
  addresses: Addresses<T>;
};

type ContractAddresses<T extends ContractsConfig> = {
  [K in keyof T]: T[K]["proxy"] extends FactoryAddressTuple ? T[K]["proxy"][1] : T[K]["impl"][1];
};

type ImplementationAddresses<T extends ContractsConfig> = {
  [K in keyof T as T[K]["proxy"] extends FactoryAddressTuple
    ? K
    : never]: T[K]["proxy"] extends FactoryAddressTuple ? T[K]["impl"][1] : never;
};

export type Addresses<T extends ContractsConfig> = ContractAddresses<T> & {
  implementations: ImplementationAddresses<T>;
};

function contracts<T extends ContractsConfig>(
  contractsConfig: T,
  runner?: ContractRunner,
): Contracts<T> {
  const contractNames = Object.keys(contractsConfig);

  const res: Record<string, BaseContract> = {};

  for (const contractName of contractNames) {
    res[contractName] = LabeledContractBuilder.build(
      contractName,
      contractsConfig[contractName],
      runner,
    );
  }
  return res as Contracts<T>;
}

function proxies<T extends ContractsConfig>(
  contractsConfig: T,
  runner?: ContractRunner,
): Proxies<T> {
  const contractNames = Object.keys(contractsConfig);

  const res: Record<string, BaseContract> = {};

  for (const contractName of contractNames) {
    const proxy = LabeledContractBuilder.buildProxy(
      contractName,
      contractsConfig[contractName],
      runner,
    );
    if (proxy) {
      res[contractName] = proxy;
    }
  }
  return res as Proxies<T>;
}

function implementations<T extends ContractsConfig>(
  contractsConfig: T,
  runner?: ContractRunner,
): Implementations<T> {
  const contractNames = Object.keys(contractsConfig);

  const res: Record<string, BaseContract> = {};

  for (const contractName of contractNames) {
    const impl = LabeledContractBuilder.buildImpl(
      contractName,
      contractsConfig[contractName],
      runner,
    );
    if (impl) {
      res[contractName] = impl;
    }
  }
  return res as Implementations<T>;
}

function protocol<T extends ContractsConfig>(
  contractsConfig: T,
  runner?: ContractRunner,
): Protocol<T> {
  return {
    contracts: {
      proxies: proxies(contractsConfig, runner),
      implementations: implementations(contractsConfig, runner),
      ...contracts(contractsConfig, runner),
    },
    addresses: addresses(contractsConfig),
  };
}

function contractAddresses<T extends ContractsConfig>(contractsConfig: T): ContractAddresses<T> {
  const contractNames = Object.keys(contractsConfig) as (keyof T)[];

  const res: Record<string, Address> = {};

  for (const contractName of contractNames) {
    const config = contractsConfig[contractName];
    const address = config.proxy ? config.proxy[1] : config.impl[1];
    res[contractName as string] = address;
  }
  return res as ContractAddresses<T>;
}

function implementationAddresses<T extends ContractsConfig>(
  contractsConfig: T,
): ImplementationAddresses<T> {
  const contractNames = Object.keys(contractsConfig) as (keyof T)[];

  const res: Record<string, Address> = {};

  for (const contractName of contractNames) {
    const config = contractsConfig[contractName];
    if (!config.proxy) {
      continue;
    }
    const address = config.impl[1];
    res[contractName as string] = address;
  }
  return res as ImplementationAddresses<T>;
}

function addresses<T extends ContractsConfig>(contractsConfig: T): Addresses<T> {
  return {
    ...contractAddresses(contractsConfig),
    implementations: implementationAddresses(contractsConfig),
  };
}

function resolver() {
  const etherscanToken = env.ETHERSCAN_TOKEN();
  if (!etherscanToken) {
    throw new EnvVariableMissingError("ETHERSCAN_TOKEN");
  }
  return new CachedContractsResolver(
    [new EtherscanLabeledAbiResolver(etherscanToken)],
    ContractAbiJsonCache.create(CONTRACTS_ABI_CACHE_PATH),
  );
}

export default {
  proxies,
  resolver,
  protocol,
  addresses,
  contracts,
  implementations,
};
