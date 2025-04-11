import format from "../common/format";
import { HexStrPrefixed } from "../common/bytes";
import { Network } from "ethers";
import {
  CallEvmOpcodes,
  CreateEvmOpcodes,
  isCallOpcode,
  isCreateOpcode,
  isLogOpcode,
  isSelfDestructOpcode,
  LogEvmOpcodes,
  SelfDestructEvmOpcodes,
} from "./evm-opcodes";
import { Address } from "../common/types";
import { NamedContract } from "../contracts";

type TxTraceOpcodes = LogEvmOpcodes | CallEvmOpcodes | CreateEvmOpcodes | SelfDestructEvmOpcodes;

interface TxTraceItemMeta<T extends TxTraceOpcodes> {
  type: T;
  depth: number;
}

export interface TxTraceCtxSpawningItem<T extends CallEvmOpcodes | CreateEvmOpcodes = CallEvmOpcodes | CreateEvmOpcodes>
  extends TxTraceItemMeta<T> {
  value: bigint;
  gasSpent: number;
  gasProvided: number;
  address: Address;
  success: boolean;
  input: HexStrPrefixed;
  output: HexStrPrefixed;
}

export interface TxTraceCallItem extends TxTraceCtxSpawningItem<CallEvmOpcodes> {
  gasLimit: number;
}

export interface TxTraceCreateItem extends TxTraceCtxSpawningItem<CreateEvmOpcodes> {
  salt?: HexStrPrefixed;
}

export interface TxTraceLogItem extends TxTraceItemMeta<LogEvmOpcodes> {
  data: HexStrPrefixed;
  address?: HexStrPrefixed;
  topic1?: HexStrPrefixed;
  topic2?: HexStrPrefixed;
  topic3?: HexStrPrefixed;
  topic4?: HexStrPrefixed;
}

export interface TxTraceSelfDestructItem extends TxTraceItemMeta<SelfDestructEvmOpcodes> {
  address: Address;
  beneficiary: Address;
}

export type TxTraceItem = TxTraceCreateItem | TxTraceCallItem | TxTraceLogItem | TxTraceSelfDestructItem;

export interface TxTraceInput {
  address: Address | null; // null when a contract creation transaction
  data?: string;
  value?: bigint;
  gasLimit?: number | bigint;
}

export class TxTrace {
  constructor(
    public readonly network: Network,
    public readonly from: Address,
    public readonly calls: TxTraceItem[],
    private readonly contracts: Record<Address, NamedContract>,
  ) {}

  public filter(predicate: (callTrace: TxTraceItem, i: number, collection: TxTraceItem[]) => boolean): TxTrace {
    const calls = this.calls.filter(predicate);
    this.updateDepths(calls);
    return new TxTrace(this.network, this.from, calls, this.contracts);
  }

  public slice(start?: number, end?: number): TxTrace {
    const calls = this.calls.slice(start, end);
    this.updateDepths(calls);
    return new TxTrace(this.network, this.from, calls, this.contracts);
  }

  public format(padding: number = 0): string {
    return this.calls.map((log) => this.formatOpCode(log, padding)).join("\n");
  }

  public formatOpCode(txTraceItem: TxTraceItem, padding?: number): string {
    if (isCallOpcode(txTraceItem.type)) return this.formatCallTraceItem(txTraceItem as TxTraceCallItem, padding);
    if (isCreateOpcode(txTraceItem.type)) return this.formatCreateTraceItem(txTraceItem as TxTraceCreateItem, padding);
    if (isSelfDestructOpcode(txTraceItem.type))
      return this.formatSelfDestructTraceItem(txTraceItem as TxTraceSelfDestructItem, padding);
    if (isLogOpcode(txTraceItem.type)) return this.formatLogTraceItem(txTraceItem as TxTraceLogItem, padding);

    return " ".repeat(txTraceItem.depth + (padding ?? 0)) + txTraceItem.type;
  }

  private formatCallTraceItem(traceCallItem: TxTraceCallItem, padding: number = 0) {
    const paddingLeft = "  ".repeat(traceCallItem.depth + padding);
    const opcode = format.opcode(traceCallItem.type);
    const contract = this.contracts[traceCallItem.address];

    const methodCallInfo = contract ? this.parseMethodCall(contract, traceCallItem.input, traceCallItem.output) : null;

    const contractLabel = methodCallInfo?.contractLabel || format.contract("UNKNOWN", traceCallItem.address);
    const methodName = methodCallInfo?.fragment.name || traceCallItem.input.slice(0, 10);
    const methodArgs =
      methodCallInfo?.fragment.inputs
        .map((input, i) => "  " + paddingLeft + format.argument(input.name, methodCallInfo.args[i]))
        .join(",\n") || "  " + paddingLeft + format.argument("data", "0x" + traceCallItem.input.slice(10));
    const methodResult = methodCallInfo?.result || traceCallItem.output;

    return (
      paddingLeft +
      opcode +
      " " +
      contractLabel +
      "." +
      format.method(methodName, methodArgs, paddingLeft) +
      " => " +
      (methodResult.toString() || "void")
    );
  }

  private formatCreateTraceItem(txCreateTraceItem: TxTraceCreateItem, padding: number = 0) {
    // TODO: implement pretty formatting
    return " ".repeat(txCreateTraceItem.depth + (padding ?? 0)) + txCreateTraceItem.type;
  }

  private formatSelfDestructTraceItem(txSelfDestructTraceItem: TxTraceSelfDestructItem, padding: number = 0) {
    // TODO: implement pretty formatting
    return " ".repeat(txSelfDestructTraceItem.depth + (padding ?? 0)) + txSelfDestructTraceItem.type;
  }

  private formatLogTraceItem(txTraceLogItem: TxTraceLogItem, padding: number = 0): string {
    const contract = this.contracts[txTraceLogItem.address!];
    if (!contract) {
      return " ".repeat(txTraceLogItem.depth + (padding ?? 0)) + txTraceLogItem.type;
    }

    const log = contract.interface.parseLog({
      topics: [txTraceLogItem.topic1, txTraceLogItem.topic2, txTraceLogItem.topic3, txTraceLogItem.topic4].filter(
        (topic) => topic !== undefined,
      ) as string[],
      data: txTraceLogItem.data,
    });
    if (!log) {
      return " ".repeat(txTraceLogItem.depth + (padding ?? 0)) + txTraceLogItem.type;
    }

    const paddingLeft = "  ".repeat(txTraceLogItem.depth + (padding ?? 0));
    return format.log(log, contract!.name, paddingLeft);
  }

  private parseMethodCall(contract: NamedContract, calldata: string, ret: string) {
    const { fragment } = contract.getFunction(calldata.slice(0, 10));
    return {
      fragment,
      contractLabel: contract.name,
      args: contract.interface.decodeFunctionData(fragment, calldata),
      result: contract.interface.decodeFunctionResult(fragment, ret),
    };
  }

  private updateDepths(calls: TxTraceItem[]) {
    const paddingsRemapping: Record<number, number> = {};

    const paddings = new Set<number>();

    for (const call of calls) {
      paddings.add(call.depth);
    }

    const paddingsSorted = Array.from(paddings).sort((a, b) => a - b);

    for (let i = 0; i < paddingsSorted.length; ++i) {
      paddingsRemapping[paddingsSorted[i]!] = i;
    }
    const depths: number[] = [];

    for (let i = 0; i < calls.length; ++i) {
      const call = calls[i]!;
      depths[i] = paddingsRemapping[call.depth]!;
      while (i < calls.length - 1 && call.depth <= calls[i + 1]!.depth) {
        if (call.depth < calls[i + 1]!.depth) {
          depths[i + 1] = depths[i]! + 1;
        } else {
          depths[i + 1] = depths[i]!;
        }
        i += 1;
      }
    }

    for (let i = 0; i < calls.length; ++i) {
      calls[i]!.depth = depths[i]!;
    }
  }
}
