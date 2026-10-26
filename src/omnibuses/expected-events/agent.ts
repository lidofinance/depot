import { Address } from "abitype";
import { decodeFunctionData, getAbiItem, toFunctionSelector } from "viem";

import { Agent_ABI } from "../../../abi/Agent.abi";
import { EvmScriptParser } from "../../aragon-votes-tools";
import bytes, { HexStrPrefixed } from "../../common/bytes";
import { contract } from "../../contracts";
import { event } from "../event-helpers";
import { GovernanceContracts } from "../governance-contracts";
import { OmnibusCallEvent } from "../omnibus-types";

const FORWARD_SELECTOR = toFunctionSelector(getAbiItem({ abi: Agent_ABI, name: "forward" }));

export function isAgentForward(payload: HexStrPrefixed): boolean {
  return bytes.isEqual(bytes.slice(payload, 0, 4), FORWARD_SELECTOR);
}

function forwarded(
  { callsScript, adminExecutor }: GovernanceContracts,
  call: { target: Address; payload: HexStrPrefixed },
  groups: OmnibusCallEvent[][],
): OmnibusCallEvent[] {
  const decoded = decodeFunctionData({ abi: Agent_ABI, data: call.payload });
  if (decoded.functionName !== "forward") {
    throw new Error(`Expected Agent.forward, got "${decoded.functionName}"`);
  }
  const [script] = decoded.args;
  if (!EvmScriptParser.isValidEvmScript(script)) {
    throw new Error("Agent forward has an unsupported EVM script spec ID");
  }
  const { calls } = EvmScriptParser.decode(script);
  if (groups.length !== calls.length) {
    throw new Error(`Agent forward has ${calls.length} calls, but ${groups.length} event groups were supplied`);
  }
  const agent = contract(Agent_ABI, call.target);
  return [
    ...calls.flatMap((forwardedCall, index) => [
      event(callsScript, "LogScriptCall", [adminExecutor.address, agent.address, forwardedCall.address], {
        emitter: agent.address,
      }),
      ...groups[index],
    ]),
    event(agent, "ScriptResult", [callsScript.address, script, "0x", "0x"]),
  ];
}

export default { forwarded };
