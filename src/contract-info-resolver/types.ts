import { Abi } from "abitype";

import { Address } from "viem";

export interface ContractInfo {
  name: string;
  abi: Abi;
  // if the contract is not proxy the address will null
  implementation: Address | null;
}
