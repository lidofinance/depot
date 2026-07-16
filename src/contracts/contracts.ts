import { NetworkName } from "../network";
import { Abi, AbiEvent, AbiFunction, Address, getAbiItem } from "viem";
import { FilterAbiEvents, FilterAbiFunctions } from "../types/abi.types";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";

import { OmnibusBase_ABI } from "../../abi/OmnibusBase.abi";

export type OmnibusBaseContract = Contract<typeof OmnibusBase_ABI>;

export interface Contract<T extends Abi = Abi, A extends Address = Address, L extends string = string> {
  abi: T;
  address: A;
  label: L;
}

// ---
// Public Methods
// ---

export function contract<T extends Abi, L extends string = string>(
  abi: T,
  address: Address,
  label?: L,
): Contract<T, Address, L> {
  const resolvedLabel = (label ?? (`Contract[${address}]` as L)) as L;
  return { abi, address, label: resolvedLabel };
}

type ContractsByLabel<Cs extends readonly Contract[]> = {
  [C in Cs[number] as C["label"]]: C;
};

type ContractTuple = readonly [abi: Abi, address: Address] | readonly [abi: Abi, address: Address, label: string];
type ContractInputMap = Record<string, ContractTuple>;

type ToPascalCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Capitalize<Head>}${ToPascalCase<Tail>}`
  : S extends `${infer Head}-${infer Tail}`
    ? `${Capitalize<Head>}${ToPascalCase<Tail>}`
    : S extends `${infer Head} ${infer Tail}`
      ? `${Capitalize<Head>}${ToPascalCase<Tail>}`
      : Capitalize<S>;

type ContractFromTuple<T extends ContractTuple, K extends string> = T extends readonly [infer A, infer Addr, infer L]
  ? A extends Abi
    ? Addr extends Address
      ? L extends string
        ? Contract<A, Addr, L>
        : never
      : never
    : never
  : T extends readonly [infer A, infer Addr]
    ? A extends Abi
      ? Addr extends Address
        ? Contract<A, Addr, ToPascalCase<K>>
        : never
      : never
    : never;

type ContractsFromMap<M extends ContractInputMap> = {
  [K in keyof M & string]: ContractFromTuple<M[K], K>;
};

export function createContracts<M extends ContractInputMap>(contractsMap: M): ContractsFromMap<M>;
export function createContracts<Cs extends readonly Contract[]>(...contracts: Cs): ContractsByLabel<Cs>;
export function createContracts(...args: unknown[]) {
  const result: Partial<Record<string, Contract>> = {};
  const usedLabels = new Set<string>();

  if (
    args.length === 1 &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    !Array.isArray(args[0]) &&
    !("abi" in (args[0] as Record<string, unknown>))
  ) {
    for (const [key, value] of Object.entries(args[0] as ContractInputMap)) {
      const [abi, address, label] = value;
      const resolvedLabel = label ?? toPascalCase(key);
      if (usedLabels.has(resolvedLabel)) {
        throw new Error(`Duplicate contract label "${resolvedLabel}"`);
      }
      usedLabels.add(resolvedLabel);
      result[key] = contract(abi, address, resolvedLabel);
    }
    return result;
  }

  for (const item of args as Contract[]) {
    if (item.label in result) {
      throw new Error(`Duplicate contract label "${item.label}"`);
    }
    result[item.label] = item;
  }

  return result;
}

function toPascalCase(value: string): string {
  if (!value.includes("_") && !value.includes("-") && !value.includes(" ")) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return value
    .split(/[_\-\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// Single contract may have a couple associated contracts if it's proxy
export async function resolveContract(network: NetworkName, address: Address): Promise<Contract[]> {
  const resolvedContract = await ContractInfoResolver.resolve(network, address);
  const implAddress = resolvedContract.implementation;

  if (!implAddress) {
    return [{ address, abi: resolvedContract.abi, label: resolvedContract.name }];
  }

  const resolvedContractImpl = await ContractInfoResolver.resolve(network, implAddress);

  return [
    { address, abi: resolvedContractImpl.abi, label: resolvedContractImpl.name },
    { address, abi: resolvedContract.abi, label: `${resolvedContractImpl.name}__Proxy` },
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
