import pretty from "../../common/pretty";
import etherscan from "../../common/etherscan";
import { BytesStringPrefixed } from "../../common/bytes";

import { LabeledContract } from "../../contracts";

export type CallTraceCallType = "CALL" | "DELEGATECALL" | "STATICCALL";
type CallTraceCreateType = "CREATE" | "CREATE2";
type CallTraceSelfDestructType = "SELFDESTRUCT";
type CallTraceCustomTypes = "UNKNOWN" | "EXCEPTION";

export type CallTraceType =
  | CallTraceCallType
  | CallTraceCreateType
  | CallTraceSelfDestructType
  | CallTraceCustomTypes;

export interface CallTraceBaseItem<T extends CallTraceType> {
  type: T;
  depth: number;
  value: bigint;
  gas: number;
  gasUsed: number;
  error?: string;
}

export interface CallTraceCallItem<T extends CallTraceCallType = CallTraceCallType>
  extends CallTraceBaseItem<T> {
  to: Address;
  input: BytesStringPrefixed;
  output: BytesStringPrefixed;
}

export interface CallTraceCreateItem extends CallTraceBaseItem<"CREATE"> {
  deployedAddress: Address;
  initCode: BytesStringPrefixed;
}

export interface CallTraceCreate2Item extends CallTraceBaseItem<"CREATE2"> {
  salt: BytesStringPrefixed;
  deployedAddress: Address;
  initCode: BytesStringPrefixed;
}

export interface CallTraceUnknownItem extends CallTraceBaseItem<"UNKNOWN"> {
  output: BytesStringPrefixed;
}

export type TxCallTraceItem =
  | CallTraceCallItem
  | CallTraceCreateItem
  | CallTraceCreate2Item
  | CallTraceUnknownItem;

export class TxCallTrace {
  readonly hash: BytesStringPrefixed;
  public readonly calls: TxCallTraceItem[] = [];
  private readonly networkName: NetworkName;
  private readonly contracts: Record<Address, LabeledContract> = {};

  constructor(
    networkName: NetworkName,
    hash: BytesStringPrefixed,
    callTrace: TxCallTraceItem[],
    contracts: Record<Address, LabeledContract>,
  ) {
    this.hash = hash;
    this.calls = callTrace;
    this.contracts = contracts;
    this.networkName = networkName;
  }

  public filter(
    predicate: (callTrace: TxCallTraceItem, i: number, collection: TxCallTraceItem[]) => boolean,
  ): TxCallTrace {
    return new TxCallTrace(
      this.networkName,
      this.hash,
      this.calls.filter(predicate),
      this.contracts,
    );
  }

  public format(): string {
    return this.calls.map((log) => this.formatOpCode(log)).join("\n");
  }

  public formatOpCode(opCode: TxCallTraceItem, padding?: number) {
    if (opCode.type === "CALL" || opCode.type === "DELEGATECALL" || opCode.type === "STATICCALL")
      return this.formatCallOpCode(opCode, padding);
  }

  private formatCallOpCode(opCode: CallTraceCallItem, padding: number = opCode.depth) {
    const paddingLeft = "  ".repeat(padding);
    const opcode = pretty.opcode(opCode.type);
    const contract = this.contracts[opCode.to];
    const methodCallInfo = contract
      ? this.parseMethodCall(contract, opCode.input, opCode.output)
      : null;

    const contractLabel = methodCallInfo?.contractLabel || "UNVERIFIED";
    const methodName = methodCallInfo?.fragment.name || opCode.input.slice(0, 10);
    const methodArgs =
      methodCallInfo?.fragment.inputs
        .map((input, i) => pretty.argument(input.name, methodCallInfo.args[i]))
        .join(", ") || "0x" + opCode.input.slice(10);
    const methodResult = methodCallInfo?.result || opCode.output;

    return (
      paddingLeft +
      opcode +
      " " +
      pretty.link(
        pretty.label(contractLabel + "." + methodName),
        etherscan.getAddressUrl(this.networkName, opCode.to),
      ) +
      `(${methodArgs})` +
      " => " +
      (methodResult.toString() || "void")
    );
  }

  private parseMethodCall(contract: LabeledContract, calldata: string, ret: string) {
    const { fragment } = contract.getFunction(calldata.slice(0, 10));
    return {
      fragment,
      contractLabel: contract.label,
      args: contract.interface.decodeFunctionData(fragment, calldata),
      result: contract.interface.decodeFunctionResult(fragment, ret),
    };
  }
}
