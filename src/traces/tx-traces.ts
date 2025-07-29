import bytes, { HexStrPrefixed } from "../common/bytes";
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
import { NetworkName } from "../network";
import { Contract, getEventAbi, getFunctionAbi } from "../contracts/contracts";
import { AbiEvent, decodeErrorResult, decodeEventLog, decodeFunctionData, decodeFunctionResult } from "viem";
import fmt from "../common/format";

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

interface TxTraceLogItemBase<_Type extends LogEvmOpcodes, _Topics extends HexStrPrefixed[]>
  extends TxTraceItemMeta<_Type> {
  data: HexStrPrefixed;
  address: HexStrPrefixed;
  topics: _Topics;
}

type TxTraceLog0Item = TxTraceLogItemBase<"LOG0", []>;
type TxTraceLog1Item = TxTraceLogItemBase<"LOG0", [HexStrPrefixed]>;
type TxTraceLog2Item = TxTraceLogItemBase<"LOG0", [HexStrPrefixed, HexStrPrefixed]>;
type TxTraceLog3Item = TxTraceLogItemBase<"LOG0", [HexStrPrefixed, HexStrPrefixed, HexStrPrefixed]>;
type TxTraceLog4Item = TxTraceLogItemBase<"LOG0", [HexStrPrefixed, HexStrPrefixed, HexStrPrefixed, HexStrPrefixed]>;

export type TxTraceLogItem = TxTraceLog0Item | TxTraceLog1Item | TxTraceLog2Item | TxTraceLog3Item | TxTraceLog4Item;

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

const PADDING_SPACER = "   ";

export class TxTrace {
  constructor(
    public readonly network: NetworkName,
    public readonly from: Address,
    public readonly calls: TxTraceItem[],
    public readonly contracts: Record<Address, Contract[]>,
    public readonly prePopulatedContracts: Contract[],
  ) {}

  public filter(predicate: (callTrace: TxTraceItem, i: number, collection: TxTraceItem[]) => boolean): TxTrace {
    const calls = this.calls.filter(predicate);
    this.updateDepths(calls);
    return new TxTrace(this.network, this.from, calls, this.contracts, this.prePopulatedContracts);
  }

  public slice(start?: number, end?: number): TxTrace {
    const calls = this.calls.slice(start, end);
    this.updateDepths(calls);
    return new TxTrace(this.network, this.from, calls, this.contracts, this.prePopulatedContracts);
  }

  public format(padding: number = 0): string {
    return this.calls.map((log) => this.formatOpCode(log, log.depth + padding)).join("\n");
  }

  public formatOpCode(txTraceItem: TxTraceItem, padding: number = 0): string {
    if (isCallOpcode(txTraceItem.type)) return this.#formatCallTraceItem(txTraceItem as TxTraceCallItem, padding);
    if (isCreateOpcode(txTraceItem.type)) return this.formatCreateTraceItem(txTraceItem as TxTraceCreateItem, padding);
    if (isSelfDestructOpcode(txTraceItem.type))
      return this.formatSelfDestructTraceItem(txTraceItem as TxTraceSelfDestructItem, padding);
    if (isLogOpcode(txTraceItem.type)) return this.#formatLogTraceItem(txTraceItem as TxTraceLogItem, padding);

    return " ".repeat(txTraceItem.depth + (padding ?? 0)) + txTraceItem.type;
  }

  #formatCallTraceItem(traceCallItem: TxTraceCallItem, padLength: number) {
    const contracts = [...this.contracts[bytes.normalize(traceCallItem.address)], ...this.prePopulatedContracts];

    let decodeResult: {
      functionName: string;
      contract: Contract;
      args: unknown[];
      inputNames: string[];
      inputTypes: string[];
      result: unknown;
    } | null = null;
    for (const c of contracts) {
      try {
        const decoded = decodeFunctionData({ abi: c.abi, data: traceCallItem.input });
        const abiItem = getFunctionAbi(c, decoded.functionName, decoded.args);
        // console.log("items:", abiItem.inputs.length, decoded.args?.length);
        if (abiItem.inputs.length !== (decoded.args?.length ?? 0)) {
          // console.log("mismatch: ", abiItem.inputs, decoded.args);
          continue;
        }
        const result = traceCallItem.success
          ? decodeFunctionResult({
              abi: c.abi,
              data: traceCallItem.output,
              functionName: decoded.functionName,
            })
          : decodeErrorResult({ abi: c.abi, data: traceCallItem.output });

        decodeResult = {
          args: (decoded.args ?? []) as unknown[],
          functionName: decoded.functionName,
          result,
          inputNames: abiItem.inputs.map((input) => input.name ?? "_"),
          inputTypes: abiItem.inputs.map((input) => input.internalType ?? input.type),
          contract: c,
        };
        break;
      } catch {}
    }

    return decodeResult
      ? fmt.decodedFuncCall({
          contract: decodeResult.contract,
          args: decodeResult.args,
          functionName: decodeResult.functionName,
          callType: traceCallItem.type,
          result: decodeResult.result as unknown[],
          padLength: padLength,
        })
      : fmt.rawFuncCall({
          address: traceCallItem.address,
          input: traceCallItem.input,
          output: traceCallItem.output,
          callType: traceCallItem.type,
          padLength,
        });
  }

  private formatCreateTraceItem(txCreateTraceItem: TxTraceCreateItem, padding: number = 0) {
    // TODO: implement pretty formatting
    return " ".repeat(txCreateTraceItem.depth + (padding ?? 0)) + txCreateTraceItem.type;
  }

  private formatSelfDestructTraceItem(txSelfDestructTraceItem: TxTraceSelfDestructItem, padding: number = 0) {
    // TODO: implement pretty formatting
    return " ".repeat(txSelfDestructTraceItem.depth + (padding ?? 0)) + txSelfDestructTraceItem.type;
  }

  #formatLogTraceItem(traceLogItem: TxTraceLogItem, padding: number): string {
    const contracts = [...this.contracts[bytes.normalize(traceLogItem.address)], ...this.prePopulatedContracts];

    let decoded: { abi: AbiEvent; args: Record<string, any> } | null = null;
    for (let i = 0; i < contracts.length; ++i) {
      try {
        const { eventName, args } = decodeEventLog({
          abi: contracts[i].abi,
          data: traceLogItem.data,
          topics: traceLogItem.topics as [HexStrPrefixed, ...HexStrPrefixed[]],
        }) as { eventName: string; args: Record<string, any> };

        const abi = getEventAbi(contracts[i], eventName);
        decoded = { abi, args };
        break;
      } catch {}
    }

    return decoded
      ? fmt.decodedLog({ ...decoded, type: traceLogItem.type, padLength: padding })
      : fmt.rawLog({ ...traceLogItem, padLength: padding });
  }

  private updateDepths(calls: TxTraceItem[]) {
    if (calls.length === 0) return;

    const depths = calls.map((call) => call.depth);

    const minDepth = Math.min(...depths);
    const maxDepth = Math.max(...depths);

    const depthsUsage = Object.fromEntries(
      Array(maxDepth - minDepth + 1)
        .fill(0)
        .map((_, i) => [minDepth + i, false]),
    );

    for (const call of calls) {
      call.depth -= minDepth;
      depthsUsage[call.depth] = true;
    }

    const depthsRewrites: Record<string, number> = {};

    let newDepth = 0;
    for (const [depth, isUsed] of Object.entries(depthsUsage)) {
      if (isUsed) {
        depthsRewrites[depth] = newDepth;
        newDepth++;
      }
    }

    for (const call of calls) {
      call.depth = depthsRewrites[call.depth];
    }
  }
}
