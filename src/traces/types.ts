type Bytes1_16 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
type Bytes17_32 = 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32;

export type EvmOpcode =
  | "STOP"
  | "ADD"
  | "MUL"
  | "SUB"
  | "DIV"
  | "SDIV"
  | "MOD"
  | "SMOD"
  | "ADDMOD"
  | "MULMOD"
  | "EXP"
  | "SIGNEXTEND"
  | "LT"
  | "GT"
  | "SLT"
  | "EQ"
  | "ISZERO"
  | "AND"
  | "OR"
  | "XOR"
  | "NOT"
  | "BYTE"
  | "SHL"
  | "SHR"
  | "SAR"
  | "SHA3"
  | "ADDRESS"
  | "BALANCE"
  | "ORIGIN"
  | "CALLER"
  | "CALLVALUE"
  | "CALLDATALOAD"
  | "CALLDATASIZE"
  | "CALLDATACOPY"
  | "CODESIZE"
  | "CODECOPY"
  | "GASPRICE"
  | "EXTCODESIZE"
  | "EXTCODECOPY"
  | "RETURNDATASIZE"
  | "RETURNDATACOPY"
  | "EXTCODEHASH"
  | "BLOCKHASH"
  | "COINBASE"
  | "TIMESTAMP"
  | "NUMBER"
  | "PREVRANDAO"
  | "GASLIMIT"
  | "CHAINID"
  | "SELFBALANCE"
  | "BASEFEE"
  | "POP"
  | "MLOAD"
  | "MSTORE"
  | "MSTORE8"
  | "SLOAD"
  | "SSTORE"
  | "JUMP"
  | "JUMPI"
  | "PC"
  | "MSIZE"
  | "GAS"
  | "JUMPDEST"
  | `PUSH0`
  | `PUSH${Bytes1_16}`
  | `PUSH${Bytes17_32}`
  | `DUP${Bytes1_16}`
  | `SWAP${Bytes1_16}`
  | `LOG${0 | 1 | 2 | 3 | 4}`
  | "CREATE"
  | "CALL"
  | "CALLCODE"
  | "RETURN"
  | "DELEGATECALL"
  | "CREATE2"
  | "STATICCALL"
  | "REVERT"
  | "INVALID"
  | "SELFDESTRUCT";
