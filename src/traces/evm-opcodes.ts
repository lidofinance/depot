type Bytes1_16 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
type Bytes17_32 = 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32

export type EvmOpcode =
  | 'STOP'
  | 'ADD'
  | 'MUL'
  | 'SUB'
  | 'DIV'
  | 'SDIV'
  | 'MOD'
  | 'SMOD'
  | 'ADDMOD'
  | 'MULMOD'
  | 'EXP'
  | 'SIGNEXTEND'
  | 'LT'
  | 'GT'
  | 'SLT'
  | 'EQ'
  | 'ISZERO'
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'NOT'
  | 'BYTE'
  | 'SHL'
  | 'SHR'
  | 'SAR'
  | 'SHA3'
  | 'ADDRESS'
  | 'BALANCE'
  | 'ORIGIN'
  | 'CALLER'
  | 'CALLVALUE'
  | 'CALLDATALOAD'
  | 'CALLDATASIZE'
  | 'CALLDATACOPY'
  | 'CODESIZE'
  | 'CODECOPY'
  | 'GASPRICE'
  | 'EXTCODESIZE'
  | 'EXTCODECOPY'
  | 'RETURNDATASIZE'
  | 'RETURNDATACOPY'
  | 'EXTCODEHASH'
  | 'BLOCKHASH'
  | 'COINBASE'
  | 'TIMESTAMP'
  | 'NUMBER'
  | 'PREVRANDAO'
  | 'GASLIMIT'
  | 'CHAINID'
  | 'SELFBALANCE'
  | 'BASEFEE'
  | 'POP'
  | 'MLOAD'
  | 'MSTORE'
  | 'MSTORE8'
  | 'SLOAD'
  | 'SSTORE'
  | 'JUMP'
  | 'JUMPI'
  | 'PC'
  | 'MSIZE'
  | 'GAS'
  | 'JUMPDEST'
  | `PUSH0`
  | `PUSH${Bytes1_16}`
  | `PUSH${Bytes17_32}`
  | `DUP${Bytes1_16}`
  | `SWAP${Bytes1_16}`
  | `LOG${0 | 1 | 2 | 3 | 4}`
  | 'CREATE'
  | 'CALL'
  | 'CALLCODE'
  | 'RETURN'
  | 'DELEGATECALL'
  | 'CREATE2'
  | 'STATICCALL'
  | 'REVERT'
  | 'INVALID'
  | 'SELFDESTRUCT'

const LOG_EVM_OPCODES = {
  LOG0: 'LOG1',
  LOG1: 'LOG1',
  LOG2: 'LOG2',
  LOG3: 'LOG3',
  LOG4: 'LOG4',
} as const

const CALL_EVM_OPCODES = {
  CALL: 'CALL',
  CALLCODE: 'CALLCODE', // outdated and maybe not supported by some dev nodes
  STATICCALL: 'STATICCALL',
  DELEGATECALL: 'DELEGATECALL',
} as const

const TERMINATION_EVM_OPCODES = {
  STOP: 'STOP',
  RETURN: 'RETURN',
  REVERT: 'REVERT',
} as const

const CREATE_EVM_OPCODES = {
  CREATE: 'CREATE',
  CREATE2: 'CREATE2',
} as const

const SELFDESTRUCT_EVM_OPCODES = {
  SELFDESTRUCT: 'SELFDESTRUCT',
} as const

export const OPCODES = {
  ...LOG_EVM_OPCODES,
  ...CALL_EVM_OPCODES,
  ...CREATE_EVM_OPCODES,
  ...TERMINATION_EVM_OPCODES,
  ...SELFDESTRUCT_EVM_OPCODES,
} as const

export type LogEvmOpcodes = keyof typeof LOG_EVM_OPCODES
export type CallEvmOpcodes = keyof typeof CALL_EVM_OPCODES
export type CreateEvmOpcodes = keyof typeof CREATE_EVM_OPCODES
export type TerminationEvmOpcodes = keyof typeof TERMINATION_EVM_OPCODES
export type SelfDestructEvmOpcodes = keyof typeof SELFDESTRUCT_EVM_OPCODES

export function isCallOpcode(opcode: any, only?: CallEvmOpcodes[]): opcode is CallEvmOpcodes {
  return only ? only.includes(opcode) : !!CALL_EVM_OPCODES[opcode as CallEvmOpcodes]
}

export function isCreateOpcode(opcode: any): opcode is CreateEvmOpcodes {
  return !!CREATE_EVM_OPCODES[opcode as CreateEvmOpcodes]
}

export function isExitOpcode(opcode: any): opcode is TerminationEvmOpcodes {
  return !!TERMINATION_EVM_OPCODES[opcode as TerminationEvmOpcodes]
}

export function isLogOpcode(op: any): op is LogEvmOpcodes {
  return !!LOG_EVM_OPCODES[op as LogEvmOpcodes]
}

export function isSelfDestructOpcode(op: any): op is SelfDestructEvmOpcodes {
  return !!SELFDESTRUCT_EVM_OPCODES[op as SelfDestructEvmOpcodes]
}
