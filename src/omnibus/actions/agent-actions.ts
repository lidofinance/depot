import { ContractCallFactory } from "../types";
import { BytesStringPrefixed } from "../../common/bytes";

type ForwardCall = [Address, BytesStringPrefixed];

function forward<F extends ForwardCall[]>(...forwards: F): ContractCallFactory {
  return ({ parser, addresses, contracts }) => {
    const evmScriptToForward = parser.serialize({
      calls: forwards.map(([address, calldata]) => ({ address, calldata })),
    });

    return {
      address: addresses.agent,
      calldata: contracts.agent.interface.encodeFunctionData("forward", [evmScriptToForward]),
    };
  };
}

export default {
  forward,
};
