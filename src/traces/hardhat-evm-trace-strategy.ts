import { get } from "lodash";
import { ContractTransactionReceipt, Provider } from "ethers";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider";

import {
  TxCallTraceBaseItem,
  TxCallTraceCallItem,
  TxCallTraceCreate2Item,
  TxCallTraceCreateItem,
  TxCallTraceItem,
  TxCallTraceSelfDestructItem,
  TxCallTraceType,
  TxCallTraceUnknownItem,
} from "./tx-call-trace";
import { TraceStrategy } from "./debug-trace-tx-strategy";
import bytes, { HexStrPrefixed } from "../common/bytes";

interface EvmError {
  error: string;
  errorType: "EvmError";
}

// source https://github.com/NomicFoundation/ethereumjs-vm/blob/60f4124daef005d913e6e7478c92d988f92d3a72/packages/evm/src/evm.ts#L960
interface ExecResult {
  // Description of the exception, if any occurred
  exceptionError?: EvmError;

  // Amount of gas the code used to run
  executionGasUsed: bigint;

  // Return value from the contract
  returnValue: Buffer;

  // A map from the accounts that have self-destructed to the addresses to send their funds to
  selfdestruct?: { [k: string]: Buffer };
}

//source https://github.com/NomicFoundation/ethereumjs-vm/blob/60f4124daef005d913e6e7478c92d988f92d3a72/packages/evm/src/evm.ts#L946
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
  nonce: HexStrPrefixed;
  gasPrice: HexStrPrefixed;
  gasLimit: HexStrPrefixed;
  to?: Address;
  value: HexStrPrefixed;
  data: HexStrPrefixed;
  v?: HexStrPrefixed;
  r?: HexStrPrefixed;
  s?: HexStrPrefixed;
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

class TraceContext {
  public readonly hash: HexStrPrefixed;
  public readonly calls: TxCallTraceItem[] = [];
  public readonly stack: TxCallTraceItem[] = [];
  public readonly selfdestructs: Set<Address> = new Set();

  constructor(hash: HexStrPrefixed) {
    this.hash = hash;
  }
}

export class HardhatEvmTraceStrategy implements TraceStrategy {
  private readonly traces: Record<string, TxCallTraceItem[]> = {};
  private context: TraceContext | null = null;

  constructor(provider: HardhatEthersProvider) {
    const vm = getHardhatVM(provider);

    vm.events.on("beforeTx", this.handleBeforeTx.bind(this));
    vm.events.on("afterTx", this.handleAfterTx.bind(this));
    vm.evm.events?.on("beforeMessage", this.handleBeforeMessage.bind(this));
    vm.evm.events?.on("afterMessage", this.handleAfterMessage.bind(this));
    vm.evm.events?.on("newContract", this.handleNewContract.bind(this));
  }

  async trace(receipt: ContractTransactionReceipt): Promise<TxCallTraceItem[]> {
    const traceData = this.traces[receipt.hash];
    if (!traceData) {
      throw new Error(
        [
          `Trace for transaction ${receipt.hash} not found.`,
          `Make sure that tracer was instantiated before the transaction was sent`,
        ].join(" "),
      );
    }
    return traceData;
  }

  private handleBeforeTx(tx: TypedTransaction, resolve: ((result?: any) => void) | undefined) {
    if (this.context) throw new Error("Another tracing is in progress");
    this.context = new TraceContext(bytes.normalize(tx.hash().toString("hex")));

    resolve?.();
  }

  private handleAfterTx(_: AfterTxEvent, resolve: ((result?: any) => void) | undefined) {
    if (!this.context) throw new Error("Active trace is not set");

    this.traces[this.context.hash] = this.context.calls;
    if (this.context.stack.length !== 0) {
      throw new Error("Context stack must be clear after tx handling");
    }
    this.context = null;

    resolve?.();
  }

  private handleBeforeMessage(message: Message, resolve: ((result?: any) => void) | undefined) {
    if (!this.context) {
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

    this.context.calls.push(item);
    this.context.stack.push(item);

    resolve?.();
  }

  private handleAfterMessage(evmResult: EVMResult, resolve: ((result?: any) => void) | undefined) {
    if (!this.context) {
      throw new Error("[hardhat-tracer]: trace is undefined in handleAfterMessage");
    }

    const context = this.context.stack.pop();
    if (!context) {
      throw new Error("Context is empty");
    }
    if (evmResult.execResult.selfdestruct) {
      const selfdestructs = Object.entries(evmResult.execResult.selfdestruct);
      for (const [address, benificiary] of selfdestructs) {
        const normalizedAddress = bytes.normalize(address);
        if (this.context.selfdestructs.has(normalizedAddress)) continue;
        this.context.selfdestructs.add(normalizedAddress);
        this.context.calls.push(
          this.seedSelfDestructItem(
            context.depth + 1,
            normalizedAddress,
            bytes.normalize(benificiary.toString("hex")),
          ),
        );
      }
    }

    context.error = evmResult.execResult.exceptionError?.error;
    context.gasUsed = Number(evmResult.execResult.executionGasUsed);

    if (
      context.type === "CALL" ||
      context.type === "DELEGATECALL" ||
      context.type === "STATICCALL" ||
      context.type === "UNKNOWN"
    ) {
      context.output = bytes.normalize(evmResult.execResult.returnValue.toString("hex"));
    }

    resolve?.();
  }

  private handleNewContract(
    contract: NewContractEvent,
    resolve: ((result?: any) => void) | undefined,
  ) {
    if (!this.context) {
      throw new Error("[hardhat-tracer]: context is undefined in handleAfterMessage");
    }
    const top = this.context.stack[this.context.stack.length - 1];
    if (!top) {
      throw new Error("Context is empty");
    }
    if (top.type !== "CREATE" && top.type !== "CREATE2") {
      throw new Error("Invalid parent context operation");
    }
    top.deployedAddress = bytes.normalize(contract.address.toString());

    resolve?.();
  }

  private seedBaseCallItem<T extends TxCallTraceType>(
    type: T,
    message: Message,
  ): TxCallTraceBaseItem<T> {
    return {
      type,
      depth: message.depth,
      gas: Number(message.gasLimit.toString()),
      gasUsed: -1,
      value: 0n,
    };
  }

  private seedDelegateCallItem(message: Message): TxCallTraceCallItem<"DELEGATECALL"> {
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

  private seedCallItem(message: Message): TxCallTraceCallItem<"CALL"> {
    return {
      ...this.seedBaseCallItem("CALL", message),
      to: bytes.prefix0x((message._codeAddress ?? message.to!).toString()),
      input: bytes.prefix0x(message.data.toString("hex")),
      value: bytes.toBigInt(message.value.toString(16)),
      output: "",
    };
  }

  private seedCreateItem(message: Message): TxCallTraceCreateItem {
    return {
      ...this.seedBaseCallItem("CREATE", message),
      initCode: bytes.prefix0x(message.data.toString("hex")),
      value: bytes.toBigInt(message.value.toString(16)),
      deployedAddress: "",
    };
  }

  private seedCreate2Item(message: Message): TxCallTraceCreate2Item {
    return {
      ...this.seedBaseCallItem("CREATE2", message),
      salt: bytes.prefix0x(message.salt!.toString("hex")),
      initCode: bytes.prefix0x(message.data.toString("hex")),
      value: bytes.toBigInt(message.value.toString(16)),
      deployedAddress: "",
    };
  }

  private seedSelfDestructItem(
    depth: number,
    contract: Address,
    beneficiary: Address,
  ): TxCallTraceSelfDestructItem {
    return {
      depth,
      value: 0n,
      contract,
      gas: -1,
      gasUsed: -1,
      beneficiary,
      type: "SELFDESTRUCT",
    };
  }

  private seedUnknownItem(message: Message): TxCallTraceUnknownItem {
    return {
      ...this.seedBaseCallItem("UNKNOWN", message),
      output: "",
    };
  }
}

function getHardhatVM(provider: HardhatEthersProvider): VM {
  const hardhatProvider: Provider = (provider as any)._hardhatProvider;
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

function unwrapProvider(provider: Provider) {
  let unwrappedProvider = provider;
  const unwrapped = new Set<Provider>();
  do {
    if (unwrapped.has(unwrappedProvider)) {
      throw new Error(`Providers cyclic dependency`);
    }
    unwrapped.add(unwrappedProvider);
    unwrappedProvider = (unwrappedProvider as any)._wrapped;
  } while (get(unwrappedProvider, "_wrapped"));
  return unwrappedProvider;
}
