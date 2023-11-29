import fetch from "node-fetch";
import { ContractTransactionReceipt, JsonRpcProvider } from "ethers";
import { TraceStrategy } from "./debug-trace-tx-strategy";
import { TxCallTraceItem } from "./tx-call-trace";
import { TxCallTraceCallType, TxCallTraceCreateItem } from "./tx-call-trace";
import bytes, { HexStrPrefixed } from "../common/bytes";

interface ParityTraceItem<A, R> {
  type: "call" | "suicide" | "create";
  error: string | undefined;
  action: A;
  result: R;
  traceAddress: number[];
}

interface CallAction {
  from: Address;
  to: Address;
  gas: HexStrPrefixed;
  value: HexStrPrefixed;
  input: HexStrPrefixed;
  callType: "call" | "delegatecall" | "staticcall";
}

interface CallActionResult {
  output: HexStrPrefixed;
  gasUsed: HexStrPrefixed;
}

interface CreateAction {
  from: Address;
  gas: HexStrPrefixed;
  value: HexStrPrefixed;
  init: HexStrPrefixed;
}

interface CreateActionResult {
  gasUsed: HexStrPrefixed;
  address: Address;
  code: HexStrPrefixed;
}

type CallParityTraceItem = ParityTraceItem<CallAction, CallActionResult>;
type CreateParityTraceItem = ParityTraceItem<CreateAction, CreateActionResult>;

type ParityTraceItems = CallParityTraceItem | CreateParityTraceItem;

function isCallParityTraceItem(item: unknown): item is CallParityTraceItem {
  return (item as ParityTraceItems).type === "call";
}

function isCreateParityTraceItem(item: unknown): item is CreateParityTraceItem {
  return (item as ParityTraceItems).type === "create";
}

export class TraceTxStrategy implements TraceStrategy {
  constructor(private readonly provider: JsonRpcProvider) {}

  async trace(receipt: ContractTransactionReceipt): Promise<TxCallTraceItem[]> {
    const { url } = this.provider._getConnection();
    const response = await fetch(url, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "trace_transaction",
        params: [receipt.hash],
      }),
    });

    const { result: items } = (await response.json()) as { result: ParityTraceItems[] };

    let result: TxCallTraceItem[] = [];

    for (let item of items) {
      if (isCallParityTraceItem(item)) {
        result.push(this.createCallTraceItem(item));
      } else if (isCreateParityTraceItem(item)) {
        result.push(this.createCreateTraceItem(item));
      } else {
        throw new Error(`Unsupported item ${item}`);
      }
    }

    return result;
  }

  private createCallTraceItem(item: CallParityTraceItem): TxCallTraceItem {
    const type = item.action.callType.toUpperCase() as TxCallTraceCallType;
    return {
      type,
      depth: item.traceAddress.length,
      to: item.action.to,
      gas: bytes.toInt(item.action.gas),
      gasUsed: bytes.toInt(item.result.gasUsed),
      value: bytes.toBigInt(item.action.value),
      input: item.action.input,
      output: item.result.output,
    };
  }

  private createCreateTraceItem(item: CreateParityTraceItem): TxCallTraceCreateItem {
    return {
      type: "CREATE",
      depth: item.traceAddress.length,
      gas: bytes.toInt(item.action.gas),
      gasUsed: bytes.toInt(item.result.gasUsed),
      value: bytes.toBigInt(item.action.value),
      deployedAddress: item.result.address,
      initCode: item.action.init,
    };
  }
}
