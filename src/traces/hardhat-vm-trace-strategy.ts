import { TxTraceInput, TxTraceItem } from "./tx-traces";
import bytes, { HexStr, HexStrPrefixed } from "../common/bytes";
import { EIP1193Provider } from "hardhat/types";
import { ContractTransactionReceipt, Provider } from "ethers";
import { get } from "lodash";
import { StructLogsTracingVisitor } from "./struct-log-tracing-visitor";
import { EventEmitter } from "events";
import { TraceStrategy } from "./types";
import { EvmOpcode } from "./evm-opcodes";

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/fork/packages/evm/src/types.ts#L12
interface EVMInterface {
  events?: AsyncEventEmitter<EVMEvents>;
}

interface JsonTx {
  nonce: HexStrPrefixed;
  gasPrice: HexStrPrefixed;
  gasLimit: HexStrPrefixed;
  to?: EthAddress;
  value: HexStrPrefixed;
  data: HexStrPrefixed;
  v?: HexStrPrefixed;
  r?: HexStrPrefixed;
  s?: HexStrPrefixed;
}

interface EthAddress {
  toString(): HexStrPrefixed;
}

interface TypedTransaction {
  hash(): Buffer;
  toJSON(): JsonTx;
  gasLimit: bigint;
  to?: EthAddress;
  data: Buffer;
  value: bigint;
}

interface InterpreterStep {
  gasLeft: bigint;
  gasRefund: bigint;
  stack: bigint[];
  returnStack: bigint[];
  pc: number;
  depth: number;
  opcode: {
    name: string;
    fee: number;
    dynamicFee?: bigint;
    isAsync: boolean;
  };
  address: EthAddress;
  memory: Buffer;
  memoryWordCount: bigint;
  codeAddress: EthAddress;
}

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/60f4124daef005d913e6e7478c92d988f92d3a72/packages/evm/src/types.ts#L216C8-L221C2
type EVMEvents = {
  step: (data: InterpreterStep, resolve?: (result?: any) => void) => void;
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
interface AsyncEventEmitter<T extends EventMap> extends EventEmitter {
  on<E extends keyof T>(event: E & string, listener: T[E]): this;
}

// source: https://github.com/NomicFoundation/ethereumjs-vm/blob/fork/packages/vm/src/vm.ts
interface VM {
  evm: EVMInterface;
  events: AsyncEventEmitter<VMEvents>;
  _common: {
    param(...params: string[]): any;
    gteHardfork(hardfork: string): boolean;
  };
  stateManager: {
    accountIsEmpty(address: EthAddress): Promise<boolean>;
    getContractStorage(address: EthAddress, key: Buffer): Promise<Buffer>;
    getContractCode(address: EthAddress): Promise<Buffer>;
  };
  eei: {
    isWarmedAddress(address: Buffer): boolean;
  };
}

class TraceContext {
  public isStepsTriggered: boolean = false;
  public readonly hash: HexStrPrefixed;
  public readonly visitor: StructLogsTracingVisitor;

  constructor(hash: HexStrPrefixed, input: TxTraceInput) {
    this.hash = hash;
    this.visitor = new StructLogsTracingVisitor(input);
  }
}

type VmListeners = EVMEvents & VMEvents;

const HARDHAT_NETWORK_RESET_EVENT = "hardhatNetworkReset";

export class HardhatVmTraceStrategy implements TraceStrategy {
  private readonly listeners: VmListeners;
  private readonly traces: Record<string, TxTraceItem[]> = {};

  private vm: VM | null = null;
  private context: TraceContext | null = null;
  private rootProvider: Provider | EIP1193Provider | null = null;

  public isInitialized: boolean = false;
  public isTracingEnabled: boolean = false;

  constructor() {
    this.listeners = {
      beforeTx: this.handleBeforeTx.bind(this),
      afterTx: this.handleAfterTx.bind(this),
      step: this.handleStep.bind(this),
    };
  }

  async init(provider: Provider | EIP1193Provider) {
    if (this.isInitialized) {
      if (this.rootProvider === unwrapProvider(provider)) return;
      throw new Error("Already initialized");
    }
    this.isInitialized = true;
    if ((provider as any)._init) {
      await (provider as any)._init();
    }
    this.rootProvider = unwrapProvider(provider);
    this.rootProvider.on(HARDHAT_NETWORK_RESET_EVENT, () => {
      this.unsubscribe();
      this.vm = this.getHardhatVM();
      this.subscribe();
    });
    this.vm = this.getHardhatVM();
    this.subscribe();
  }

  isSameRootProvider(provider: Provider | EIP1193Provider) {
    return this.rootProvider === unwrapProvider(provider);
  }

  async trace(receipt: ContractTransactionReceipt): Promise<TxTraceItem[]> {
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

  public enableTracing() {
    this.isTracingEnabled = true;
  }

  public disableTracing() {
    this.isTracingEnabled = false;
  }

  private unsubscribe() {
    if (!this.vm) {
      throw new Error(`Unitialized`);
    }
    this.vm.events.off("beforeTx", this.listeners.beforeTx);
    this.vm.events.off("afterTx", this.listeners.afterTx);
    this.vm.evm.events?.off("step", this.listeners.step);
  }

  private subscribe() {
    if (!this.vm) {
      throw new Error(`Unitialized`);
    }
    this.vm.events.on("beforeTx", this.listeners.beforeTx);
    this.vm.events.on("afterTx", this.listeners.afterTx);
    this.vm.evm.events?.on("step", this.listeners.step);
  }

  private handleBeforeTx(tx: TypedTransaction, resolve: ((result?: any) => void) | undefined) {
    if (this.isTracingEnabled) {
      if (this.context) throw new Error("Another tracing is in progress");
      this.context = new TraceContext(bytes.normalize(tx.hash().toString("hex")), {
        address: tx.to?.toString() ?? "0x",
        gasLimit: Number(tx.gasLimit),
        data: tx.data.toString("hex"),
        value: tx.value,
      });
    }
    resolve?.();
  }

  private handleAfterTx(_: AfterTxEvent, resolve: ((result?: any) => void) | undefined) {
    if (this.isTracingEnabled) {
      if (!this.context) throw new Error("Active trace is not set");
      if (this.context.isStepsTriggered) {
        this.traces[this.context.hash] = this.context.visitor.finalize();
      }
      this.context = null;
    }
    resolve?.();
  }

  private handleStep(data: InterpreterStep, resolve?: (result?: any) => void) {
    if (this.isTracingEnabled) {
      if (!this.context) {
        throw new Error("TraceContext is null");
      }
      // when the view transaction is called, the handleStep method is not called,
      // such transaction will not be recorded
      if (!this.context.isStepsTriggered) {
        this.context.isStepsTriggered = true;
      }
      const memory: HexStr[] = [];
      for (let i = 0; i < Number(data.memoryWordCount); ++i) {
        memory.push(data.memory.subarray(32 * i, 32 * (i + 1)).toString("hex"));
      }
      this.context.visitor.visit({
        pc: data.pc,
        op: data.opcode.name as EvmOpcode,
        depth: data.depth + 1,
        gas: Number(data.gasLeft),
        gasCost: Number(data.opcode.dynamicFee ?? data.opcode.fee),
        error: null,
        stack: data.stack.map((item) => bytes.padStart(item.toString(16), 32)),
        memory,
      });
    }
    resolve?.();
  }

  private getHardhatVM() {
    if (!this.rootProvider) {
      throw new Error(`Not initialized`);
    }
    const node = get(this.rootProvider, "_node");
    if (!node) {
      throw new Error("HardhatEthersProvider wasn't initialized properly");
    }
    const vm = get(node, "_vm");
    if (!vm) {
      throw new Error("_vm property is missing on node instance");
    }

    return vm;
  }
}

function unwrapProvider(provider: Provider | EIP1193Provider) {
  provider = (provider as any)._hardhatProvider ?? provider;

  const unwrappedProviders = new Set<Provider>();
  while (true) {
    const unwrapped = (provider as any)._wrapped;
    if (!unwrapped) return provider;
    if (unwrappedProviders.has(unwrapped)) {
      throw new Error(`Providers cyclic dependency`);
    }
    unwrappedProviders.add(unwrapped);
    provider = unwrapped;
  }
}
