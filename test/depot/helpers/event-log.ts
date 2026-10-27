import { encodeAbiParameters, encodeEventTopics, Hex, Log } from "viem";

import { Contract } from "../../../src/contracts";

export function eventLog(emitter: Contract, eventName: string, args: unknown[], overrides: Partial<Log> = {}): Log {
  const abiEvent = emitter.abi.find((item) => item.type === "event" && item.name === eventName);
  if (!abiEvent || abiEvent.type !== "event") {
    throw new Error(`No event "${eventName}" in ${emitter.label} ABI`);
  }
  const indexedArgs = abiEvent.inputs.flatMap((input, index) => (input.indexed ? [args[index]] : []));
  const plainInputs = abiEvent.inputs.filter((input) => !input.indexed);
  const plainArgs = abiEvent.inputs.flatMap((input, index) => (input.indexed ? [] : [args[index]]));

  return {
    address: emitter.address,
    topics: encodeEventTopics({ abi: [abiEvent], eventName: abiEvent.name, args: indexedArgs as never }) as [
      Hex,
      ...Hex[],
    ],
    data: encodeAbiParameters(plainInputs, plainArgs),
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: null,
    logIndex: null,
    removed: false,
    ...overrides,
  };
}
