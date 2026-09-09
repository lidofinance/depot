import { Address } from "abitype";

import { OssifiableProxy_ABI } from "../../../abi/OssifiableProxy.abi";
import { Contract } from "../../contracts";
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
  const ossifiableProxy: Contract<typeof OssifiableProxy_ABI> = {
    abi: OssifiableProxy_ABI,
    label: proxy.label,
    address: proxy.address,
  };
  return [event(ossifiableProxy, "Upgraded", [input.implementation])];
}

function contractVersionSet(versioned: Contract, input: { version: bigint }): OmnibusCallEvent[] {
  const contract: Contract<typeof Versioned_ABI> = {
    abi: Versioned_ABI,
    label: versioned.label,
    address: versioned.address,
  };
  return [event(contract, "ContractVersionSet", [input.version])];
}

export default { upgraded, contractVersionSet };
