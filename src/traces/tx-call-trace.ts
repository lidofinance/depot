import contracts from "../contracts";
import format from "../common/format";
import { HexStrPrefixed } from "../common/bytes";
import { BaseContract, Network } from "ethers";

export type TxCallTraceCallType = "CALL" | "DELEGATECALL" | "STATICCALL";
type TxCallTraceCreateType = "CREATE" | "CREATE2";
type TxCallTraceSelfDestructType = "SELFDESTRUCT";
type TxCallTraceCustomTypes = "UNKNOWN" | "EXCEPTION";

export type TxCallTraceType =
  | TxCallTraceCallType
  | TxCallTraceCreateType
  | TxCallTraceSelfDestructType
  | TxCallTraceCustomTypes;

export interface TxCallTraceBaseItem<T extends TxCallTraceType = TxCallTraceType> {
  type: T;
  depth: number;
  value: bigint;
  gas: number;
  gasUsed: number;
  error?: string;
}

export interface TxCallTraceCallItem<T extends TxCallTraceCallType = TxCallTraceCallType>
  extends TxCallTraceBaseItem<T> {
  to: Address;
  input: HexStrPrefixed;
  output: HexStrPrefixed | "";
}

export interface TxCallTraceCreateItem extends TxCallTraceBaseItem<"CREATE"> {
  // during the item building, this field may be seeded with empty string value
  deployedAddress: Address | "";
  initCode: HexStrPrefixed;
}

export interface TxCallTraceCreate2Item extends TxCallTraceBaseItem<"CREATE2"> {
  salt: HexStrPrefixed;
  deployedAddress: Address | "";
  initCode: HexStrPrefixed;
}

export interface TxCallTraceSelfDestructItem extends TxCallTraceBaseItem<"SELFDESTRUCT"> {
  contract: Address | "";
  beneficiary: Address;
}

export interface TxCallTraceUnknownItem extends TxCallTraceBaseItem<"UNKNOWN"> {
  output: HexStrPrefixed | "";
}

export type TxCallTraceItem =
  | TxCallTraceCallItem
  | TxCallTraceCreateItem
  | TxCallTraceCreate2Item
  | TxCallTraceUnknownItem
  | TxCallTraceSelfDestructItem;

export class TxCallTrace {
  constructor(
    public readonly network: Network,
    public readonly from: Address,
    public readonly calls: TxCallTraceItem[],
    private readonly contracts: Record<Address, BaseContract>,
  ) {}

  public filter(
    predicate: (callTrace: TxCallTraceItem, i: number, collection: TxCallTraceItem[]) => boolean,
  ): TxCallTrace {
    const calls = this.calls.filter(predicate);
    this.updateDepths(calls);
    return new TxCallTrace(this.network, this.from, calls, this.contracts);
  }

  public slice(start?: number, end?: number): TxCallTrace {
    const calls = this.calls.slice(start, end);
    this.updateDepths(calls);
    return new TxCallTrace(this.network, this.from, calls, this.contracts);
  }

  public format(padding: number = 0): string {
    return this.calls.map((log) => this.formatOpCode(log, padding)).join("\n");
  }

  public formatOpCode(opCode: TxCallTraceItem, padding?: number) {
    if (opCode.type === "CALL" || opCode.type === "DELEGATECALL" || opCode.type === "STATICCALL")
      return this.formatCallOpCode(opCode, padding);
    return opCode.type;
  }

  private formatCallOpCode(opCode: TxCallTraceCallItem, padding: number = 0) {
    const paddingLeft = "  ".repeat(opCode.depth + padding);
    const opcode = format.opcode(opCode.type);
    const contract = this.contracts[opCode.to];
    const methodCallInfo = contract
      ? this.parseMethodCall(contract, opCode.input, opCode.output)
      : null;

    const contractLabel = methodCallInfo?.contractLabel || format.contract("UNKNOWN", opCode.to);
    const methodName = methodCallInfo?.fragment.name || opCode.input.slice(0, 10);
    const methodArgs =
      methodCallInfo?.fragment.inputs
        .map((input, i) => "  " + paddingLeft + format.argument(input.name, methodCallInfo.args[i]))
        .join(",\n") || "  " + paddingLeft + format.argument("data", "0x" + opCode.input.slice(10));
    const methodResult = methodCallInfo?.result || opCode.output;

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

  private parseMethodCall(contract: BaseContract, calldata: string, ret: string) {
    const { fragment } = contract.getFunction(calldata.slice(0, 10));
    return {
      fragment,
      contractLabel: contracts.label(contract),
      args: contract.interface.decodeFunctionData(fragment, calldata),
      result: contract.interface.decodeFunctionResult(fragment, ret),
    };
  }

  private updateDepths(calls: TxCallTraceItem[]) {
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
