import { Abi } from "abitype";

import { Address } from "../common/types";

export interface ContractInfo {
  name: string;
  abi: Abi;
  // if the contract is not proxy the address will null
  implementation: Address | null;
}
