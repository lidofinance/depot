import { LabeledContract } from "../contracts";
import { EventInfo } from "./types";

interface GetEventInfoParams<T extends LabeledContract> {
  contract: T;
  name: Parameters<T["interface"]["getEvent"]>[0];
  args?: unknown[];
  address?: Address;
}

export function getEventInfo<T extends LabeledContract>({
  name,
  contract,
  args,
  address,
}: GetEventInfoParams<T>): EventInfo {
  const fragment = contract.interface.getEvent(name);
  if (!fragment) {
    throw new Error(`EventFragment ${name} not found in the ${contract.label} (${contract.label})`);
  }
  return {
    args,
    fragment,
    address: address ?? contract.address,
  };
}
