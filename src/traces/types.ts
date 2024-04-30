import type { ContractTransactionReceipt } from "ethers";

import type { HexStr } from "../common/bytes";
import type { EvmOpcode } from "./evm-opcodes";
import type { TxTraceItem } from "./tx-traces";

// Trace information emitted by the default Go tracer
export interface RawStructLog<T extends EvmOpcode = EvmOpcode> {
  // Program counter
  pc: number;

  // Opcode to be executed
  op: T;

  // Remaining gas
  gas: number | HexStr;

  // Cost fo executing op
  gasCost: number;

  //  Current call depth
  depth: number;

  // Error message if any
  error: HexStr | null | undefined;

  // EVM memory. Disabled via 'disableMemory'
  memory: HexStr[] | null | undefined;

  // EVM stack. Disabled via 'disableStack'
  stack: HexStr[] | null | undefined;

  // Storage slots of current contract read from and written to. Disabled via 'disableStorage'
}

export interface TraceStrategy {
  trace(receipt: ContractTransactionReceipt): Promise<TxTraceItem[]>;
}
