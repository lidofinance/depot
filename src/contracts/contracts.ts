import { Abi, AbiEvent, AbiFunction, Address, getAbiItem } from "viem";
import { ExtractAbiEventNames, ExtractAbiFunctionNames } from "abitype";

import { OmnibusBase_ABI } from "@/abi/OmnibusBase.abi";

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

// TODO: add support for overloaded events
export function getEventAbi<T extends Pick<Contract, "abi">>(
  contract: T,
  eventName: ExtractAbiEventNames<T["abi"]>,
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
  functionName: ExtractAbiFunctionNames<T["abi"]>,
  args?: unknown[] | readonly unknown[],
): AbiFunction {
  const abi = getAbiItem({ abi: contract.abi as unknown[], name: functionName as string, args });
  if (!abi) {
    throw new Error(`Function with name ${functionName} not found`);
  }
  if (abi.type !== "function") {
    throw new Error(`abi element is not "function" type`);
  }
  return abi;
}
