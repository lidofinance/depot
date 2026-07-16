import { Address, PublicClient } from "viem";
import { TxTraceCallItem, TxTraceCreateItem, TxTraceItem } from "./tx-traces";
import { TraceStrategy } from "./types";
import { HexStrPrefixed } from "../common/bytes";
import { CallEvmOpcodes } from "./evm-opcodes";

interface ParityTraceItem {
  action: {
    from: Address;
    callType: "call" | "delegatecall" | "staticcall";
    gas: HexStrPrefixed;
    input: HexStrPrefixed;
    to: Address;
    value: HexStrPrefixed;
  };
  blockHash: HexStrPrefixed;
  blockNumber: number;
  error?: HexStrPrefixed;
  result: {
    gasUsed: HexStrPrefixed;
    output: HexStrPrefixed;
  };
  subtraces: number;
  traceAddress: [];
  transactionHash: HexStrPrefixed;
  transactionPosition: number;
  type: "call" | "create";
}

export class ParityTraceStrategy implements TraceStrategy {
  #client: PublicClient;

  constructor(client: PublicClient) {
    this.#client = client;
  }

  async trace(txHash: HexStrPrefixed): Promise<TxTraceItem[]> {
    const raw: unknown = await this.#client.transport.request({
      method: "trace_transaction",
      params: [txHash],
    });
    if (!Array.isArray(raw)) {
      throw new Error(`trace_transaction(${txHash}) returned non-array response`);
    }
    const rawCallTrace = raw.map((item, i) => assertParityTraceItem(item, txHash, i));

    const result: (TxTraceCallItem | TxTraceCreateItem)[] = [];

    for (const trace of rawCallTrace) {
      const depth = trace.traceAddress.length;
      if (trace.type === "call") {
        const callItem = createTxTraceCallItem(trace, depth);
        result.push(callItem);
      } else if (trace.type === "create") {
        const createItem = createTxTraceCreateItem(trace, depth);
        result.push(createItem);
      } else {
        throw new Error(`Unsupported trace type: ${trace.type}`);
      }
    }

    return result;
  }
}

function assertParityTraceItem(item: unknown, txHash: string, index: number): ParityTraceItem {
  if (typeof item !== "object" || item === null) {
    throw new Error(`trace_transaction(${txHash}) item ${index} is not an object`);
  }
  const obj = item as Record<string, unknown>;
  if (obj.type !== "call" && obj.type !== "create") {
    throw new Error(`trace_transaction(${txHash}) item ${index} has unexpected type: ${String(obj.type)}`);
  }
  if (typeof obj.action !== "object" || obj.action === null) {
    throw new Error(`trace_transaction(${txHash}) item ${index} missing action`);
  }
  if (!Array.isArray(obj.traceAddress)) {
    throw new Error(`trace_transaction(${txHash}) item ${index} missing traceAddress array`);
  }
  return item as ParityTraceItem;
}

function createTxTraceCallItem(callTraceItem: ParityTraceItem, depth: number): TxTraceCallItem {
  let callType: CallEvmOpcodes | null = null;
  if (callTraceItem.action.callType === "call") {
    callType = "CALL";
  } else if (callTraceItem.action.callType === "delegatecall") {
    callType = "DELEGATECALL";
  } else if (callTraceItem.action.callType === "staticcall") {
    callType = "STATICCALL";
  } else {
    throw new Error(`Invalid call trace item action type ${callTraceItem.action.callType}`);
  }
  return {
    type: callType,
    depth,
    value: BigInt(callTraceItem.action.value),
    gasSpent: Number(callTraceItem.result.gasUsed),
    gasProvided: Number(callTraceItem.action.gas),
    address: callTraceItem.action.to,
    success: !callTraceItem.error,
    input: callTraceItem.action.input,
    output: callTraceItem.result.output,
    gasLimit: Number(callTraceItem.action.gas),
  };
}

function createTxTraceCreateItem(callTraceItem: ParityTraceItem, depth: number): TxTraceCreateItem {
  if (callTraceItem.type !== "create") {
    throw new Error(`Invalid call trace item type ${callTraceItem.type}`);
  }
  return {
    type: "CREATE",
    depth,
    value: BigInt(callTraceItem.action.value),
    gasSpent: Number(callTraceItem.result.gasUsed),
    gasProvided: Number(callTraceItem.action.gas),
    address: callTraceItem.action.to,
    success: !callTraceItem.error,
    input: callTraceItem.action.input,
    output: callTraceItem.result.output,
  };
}
