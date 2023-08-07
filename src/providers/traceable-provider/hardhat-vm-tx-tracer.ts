import { Provider } from "ethers";
import bytes, { BytesStringPrefixed } from "../../common/bytes";
import { ContractsResolver, LabeledContract } from "../../contracts";
import {
  TxCallTraceItem,
  TxCallTrace,
  CallTraceType,
  CallTraceBaseItem,
  CallTraceCallItem,
  CallTraceUnknownItem,
  CallTraceCreate2Item,
  CallTraceCreateItem,
} from "./transaction-call-trace";
import { StaticProvider } from "../static-provider";
import { SendProvider } from "../types";

interface EvmError {
  error: string;
  errorType: "EvmError";
}

interface ExecResult {
  exceptionError?: EvmError;
  executionGasUsed: bigint;
  returnValue: Buffer;
}

interface EVMResult {
  createdAddress?: Address;
  execResult: ExecResult;
}

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/fork/packages/evm/src/types.ts#L12
interface EVMInterface {
  events?: AsyncEventEmitter<EVMEvents>;
}

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/60f4124daef005d913e6e7478c92d988f92d3a72/packages/evm/src/types.ts#L210C1-L214C2
interface NewContractEvent {
  address: Address;
  code: Buffer;
}

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/60f4124daef005d913e6e7478c92d988f92d3a72/packages/evm/src/message.ts#L37
interface Message {
  to?: Address;
  value: bigint;
  caller: Address;
  depth: number;
  _codeAddress?: Address;
  delegatecall: boolean;
  data: Buffer;
  gasLimit: bigint;
  salt?: Buffer;
  isStatic: boolean;
}

interface JsonTx {
  nonce: BytesStringPrefixed;
  gasPrice: BytesStringPrefixed;
  gasLimit: BytesStringPrefixed;
  to?: Address;
  value: BytesStringPrefixed;
  data: BytesStringPrefixed;
  v?: BytesStringPrefixed;
  r?: BytesStringPrefixed;
  s?: BytesStringPrefixed;
}

interface TypedTransaction {
  hash(): Buffer;
  toJSON(): JsonTx;
}

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/60f4124daef005d913e6e7478c92d988f92d3a72/packages/evm/src/types.ts#L216C8-L221C2
type EVMEvents = {
  newContract: (data: NewContractEvent, resolve?: (result?: any) => void) => void;
  beforeMessage: (data: Message, resolve?: (result?: any) => void) => void;
  afterMessage: (data: EVMResult, resolve?: (result?: any) => void) => void;
};

type AfterTxEvent = unknown;

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/60f4124daef005d913e6e7478c92d988f92d3a72/packages/vm/src/types.ts#L51C8-L56C2
type VMEvents = {
  beforeTx: (data: TypedTransaction, resolve?: (result?: any) => void) => void;
  afterTx: (data: AfterTxEvent, resolve?: (result?: any) => void) => void;
};

// source: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/8306f6528bc48fc9d14743db994317254eb9acbd/types/async-eventemitter/index.d.ts#L103
type AsyncListener<T, R> =
  | ((data: T, callback: (result?: R) => void) => Promise<R>)
  | ((data: T, callback: (result?: R) => void) => void);

// source: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/8306f6528bc48fc9d14743db994317254eb9acbd/types/async-eventemitter/index.d.ts#L104
interface EventMap {
  [event: string]: AsyncListener<any, any>;
}

// source: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/async-eventemitter/index.d.ts
interface AsyncEventEmitter<T extends EventMap> {
  on<E extends keyof T>(event: E & string, listener: T[E]): this;
}

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/fork/packages/vm/src/vm.ts
interface VM {
  evm: EVMInterface;
  events: AsyncEventEmitter<VMEvents>;
}

interface TxCallTraceData {
  hash: string;
  callsTrace: TxCallTraceItem[];
}

function get(object: any, property: string) {
  return object[property];
}

function unwrapProvider(provider: Provider) {
  let unwrappedProvider = provider;
  const unwrapped = new Set<Provider>();
  do {
    if (unwrapped.has(unwrappedProvider)) {
      throw new Error(`Providers cyclic dependency`);
    }
    unwrapped.add(unwrappedProvider);
    unwrappedProvider = get(unwrappedProvider, "_wrapped");
  } while (get(unwrappedProvider, "_wrapped"));
  return unwrappedProvider;
}

function getHardhatVM<T extends Provider>(provider: T): VM {
  const hardhatProvider: any = get(provider, "_hardhatProvider");
  const unwrappedProvider = unwrapProvider(hardhatProvider);

  const node = get(unwrappedProvider, "_node");
  if (!node) {
    throw new Error("HardhatEthersProvider wasn't initialized properly");
  }
  const vm = get(node, "_vm");
  if (!vm) {
    throw new Error("_vm property is missing on node instance");
  }

  return vm;
}

export class HardhatVmTxTracer<T extends StaticProvider<SendProvider>> {
  private readonly networkName: NetworkName;
  private readonly traces: Record<string, TxCallTraceData> = {};
  private readonly contractsResolver: ContractsResolver;

  private trace?: TxCallTraceData;
  private evmContextsStack: TxCallTraceItem[] = [];

  public isTracingEnabled: boolean = false;

  constructor(provider: T, contractsResolver: ContractsResolver) {
    this.networkName = provider.network.name as NetworkName;
    this.contractsResolver = contractsResolver;

    const vm = getHardhatVM(provider);

    vm.events.on("beforeTx", this.handleBeforeTx.bind(this));
    vm.events.on("afterTx", this.handleAfterTx.bind(this));
    vm.evm.events?.on("beforeMessage", this.handleBeforeMessage.bind(this));
    vm.evm.events?.on("afterMessage", this.handleAfterMessage.bind(this));
    vm.evm.events?.on("newContract", this.handleNewContract.bind(this));
  }

  public async getTrace(hash: string) {
    const traceData = this.traces[hash];
    if (!traceData) return undefined;
    const addresses = new Set<Address>();
    for (let callTrace of traceData.callsTrace) {
      // may be eoa
      //   addresses.add(callTrace.from);
      if (
        callTrace.type === "CALL" ||
        callTrace.type === "DELEGATECALL" ||
        callTrace.type === "STATICCALL"
      ) {
        addresses.add(callTrace.to);
      }
      if (callTrace.type === "CREATE" || callTrace.type === "CREATE2") {
        addresses.add(callTrace.deployedAddress);
      }
    }
    const contracts = await this.resolveContracts(this.networkName, Array.from(addresses));
    return new TxCallTrace(this.networkName, hash, traceData.callsTrace, contracts);
  }

  public enableTracing() {
    this.isTracingEnabled = true;
  }

  public disableTracing() {
    this.isTracingEnabled = false;
  }

  private handleBeforeTx(tx: TypedTransaction, resolve: ((result?: any) => void) | undefined) {
    if (this.isTracingEnabled) {
      if (this.trace) throw new Error("Another tracing is in progress");
      const hash = "0x" + tx.hash().toString("hex");
      this.trace = { hash, callsTrace: [] };
    }
    resolve?.();
  }

  private handleAfterTx(_: AfterTxEvent, resolve: ((result?: any) => void) | undefined) {
    if (this.isTracingEnabled) {
      if (!this.trace) throw new Error("Active trace is not set");

      this.traces[this.trace.hash] = this.trace;
      this.trace = undefined;

      if (this.evmContextsStack.length !== 0) {
        throw new Error("Context stack must be clear after tx handling");
      }

      this.evmContextsStack = [];
    }

    resolve?.();
  }

  private handleBeforeMessage(message: Message, resolve: ((result?: any) => void) | undefined) {
    if (this.isTracingEnabled) {
      if (!this.trace) {
        throw new Error("[hardhat-tracer]: trace is undefined in handleBeforeMessage");
      }
      let item: TxCallTraceItem;
      if (message.delegatecall) {
        item = this.seedDelegateCallItem(message);
      } else if (message.to) {
        item = this.seedCallItem(message);
      } else if (message.to === undefined && message.salt === undefined) {
        item = this.seedCreateItem(message);
      } else if (message.to === undefined && message.salt !== undefined) {
        item = this.seedCreate2Item(message);
      } else {
        item = this.seedUnknownItem(message);
        console.error("handleBeforeMessage: message type not handled", message);
      }

      this.trace.callsTrace.push(item);
      this.evmContextsStack.push(item);
    }

    resolve?.();
  }

  private handleAfterMessage(evmResult: EVMResult, resolve: ((result?: any) => void) | undefined) {
    if (this.isTracingEnabled) {
      if (!this.trace) {
        throw new Error("[hardhat-tracer]: trace is undefined in handleAfterMessage");
      }

      const context = this.evmContextsStack.pop();
      if (!context) {
        throw new Error("Context is empty");
      }

      context.error = evmResult.execResult.exceptionError?.error;
      context.gasUsed = Number(evmResult.execResult.executionGasUsed);

      if (
        context.type === "CALL" ||
        context.type === "DELEGATECALL" ||
        context.type === "STATICCALL" ||
        context.type === "UNKNOWN"
      ) {
        context.output = "0x" + evmResult.execResult.returnValue.toString("hex");
      }
    }

    resolve?.();
  }

  private handleNewContract(
    contract: NewContractEvent,
    resolve: ((result?: any) => void) | undefined,
  ) {
    if (this.isTracingEnabled) {
      const top = this.evmContextsStack.pop();
      if (!this.trace || !top) {
        throw new Error("Context is empty");
      }
      if (top.type !== "CREATE" && top?.type !== "CREATE2") {
        throw new Error("Invalid parent context operation");
      }
      top.deployedAddress = bytes.prefix0x(contract.address.toString());
    }

    resolve?.();
  }

  private async resolveContracts(
    network: NetworkName,
    addresses: Address[],
  ): Promise<Record<Address, LabeledContract>> {
    const res: Record<Address, LabeledContract> = {};
    const resolvedContracts = new Set<Address>();
    for (const address of addresses) {
      if (resolvedContracts.has(address)) continue;
      resolvedContracts.add(address);
      const contract = await this.contractsResolver.resolve(network, address);
      if (contract) {
        res[address] = contract;
      }
    }
    return res;
  }

  private seedBaseCallItem<T extends CallTraceType>(
    type: T,
    message: Message,
  ): CallTraceBaseItem<T> {
    return {
      type,
      depth: message.depth,
      //   from: bytes.prefix0x(message.caller.toString()),
      gas: Number(message.gasLimit.toString()),
      gasUsed: -1,
      value: 0n,
    };
  }

  private seedDelegateCallItem(message: Message): CallTraceCallItem<"DELEGATECALL"> {
    if (message.to === undefined) {
      throw new Error("[hardhat-tracer]: message.to is undefined on delegate call parsing");
    }
    return {
      ...this.seedBaseCallItem("DELEGATECALL", message),
      to: bytes.prefix0x((message._codeAddress ?? message.to).toString()),
      input: bytes.prefix0x(message.data.toString("hex")),
      output: "",
    };
  }

  private seedCallItem(message: Message): CallTraceCallItem<"CALL"> {
    return {
      ...this.seedBaseCallItem("CALL", message),
      to: bytes.prefix0x((message._codeAddress ?? message.to!).toString()),
      input: bytes.prefix0x(message.data.toString("hex")),
      value: bytes.toBigInt(message.value.toString(16)),
      output: "",
    };
  }

  private seedCreateItem(message: Message): CallTraceCreateItem {
    return {
      ...this.seedBaseCallItem("CREATE", message),
      initCode: bytes.prefix0x(message.data.toString("hex")),
      value: bytes.toBigInt(message.value.toString(16)),
      deployedAddress: "",
    };
  }

  private seedCreate2Item(message: Message): CallTraceCreate2Item {
    return {
      ...this.seedBaseCallItem("CREATE2", message),
      salt: bytes.prefix0x(message.salt!.toString("hex")),
      initCode: bytes.prefix0x(message.data.toString("hex")),
      value: bytes.toBigInt(message.value.toString(16)),
      deployedAddress: "",
    };
  }

  private seedUnknownItem(message: Message): CallTraceUnknownItem {
    return {
      ...this.seedBaseCallItem("UNKNOWN", message),
      output: "",
    };
  }
}
