import { Address } from "viem";

import { OssifiableProxy_ABI } from "@/abi/OssifiableProxy.abi";
import { contract, Contract } from "@/src/contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

const Versioned_ABI = [
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: "uint256", name: "version", type: "uint256" }],
    name: "ContractVersionSet",
    type: "event",
  },
] as const;

function upgraded(proxy: Contract, input: { implementation: Address }): OmnibusCallEvent[] {
  const ossifiableProxy = contract(OssifiableProxy_ABI, proxy.address, proxy.label);
  return [event(ossifiableProxy, "Upgraded", [input.implementation])];
}

function contractVersionSet(versioned: Contract, input: { version: bigint }): OmnibusCallEvent[] {
  const versionedContract = contract(Versioned_ABI, versioned.address, versioned.label);
  return [event(versionedContract, "ContractVersionSet", [input.version])];
}

export default { upgraded, contractVersionSet };
