import { Address } from "abitype";
import { keccak256, toHex } from "viem";

import { Kernel_ABI } from "../../../abi/Kernel.abi";
import { HexStrPrefixed } from "../../common/bytes";
import { Contract } from "../../contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

function appImplementationUpdated(
  kernel: Contract<typeof Kernel_ABI>,
  input: { appId: HexStrPrefixed; implementation: Address },
): OmnibusCallEvent[] {
  return [event(kernel, "SetApp", [keccak256(toHex("base")), input.appId, input.implementation])];
}

export default { appImplementationUpdated };
