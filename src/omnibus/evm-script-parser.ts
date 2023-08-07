import bytes, { BytesStringPrefixed } from "../common/bytes";
import { ADDRESS_LENGTH } from "../constants";
import { ContractCall } from "./types";

export interface EvmScriptParser {
  parse(evmScript: BytesStringPrefixed): Required<ParsedEvmScript>;
  serialize(evmScript: ParsedEvmScript): BytesStringPrefixed;
}

interface ParsedEvmScript {
  specId?: string;
  calls: ContractCall[];
}

const SPEC_ID_LENGTH = 4;
const CALLDATA_LENGTH = 4;
const CALLDATA_LENGTH_LENGTH = 4;
const DEFAULT_SPEC_ID = "0x00000001";

function parse(evmScript: BytesStringPrefixed) {
  const evmScriptLength = bytes.length(evmScript);
  if (evmScriptLength < SPEC_ID_LENGTH) {
    throw new Error("Invalid evmScript length");
  }
  const res: Required<ParsedEvmScript> = {
    specId: bytes.slice(evmScript, 0, SPEC_ID_LENGTH),
    calls: [],
  };
  let startIndex = SPEC_ID_LENGTH;
  while (startIndex < evmScriptLength) {
    const address = bytes.slice(evmScript, startIndex, (startIndex += ADDRESS_LENGTH));
    const calldataLength = bytes.toInt(
      bytes.slice(evmScript, startIndex, (startIndex += CALLDATA_LENGTH)),
    );
    const calldata = bytes.slice(evmScript, startIndex, (startIndex += calldataLength));
    res.calls.push({ address, calldata });
  }

  if (startIndex !== evmScriptLength) {
    throw new Error("Invalid evmScript length");
  }
  return res;
}

function serialize(evmScript: ParsedEvmScript): BytesStringPrefixed {
  const res = evmScript.calls.reduce(
    (evmScript, call) => bytes.join(evmScript, encodeEvmScriptCall(call)),
    evmScript.specId ?? DEFAULT_SPEC_ID,
  );
  return res;
}

function encodeEvmScriptCall(call: ContractCall) {
  return bytes.join(
    call.address,
    bytes.padStart(bytes.encode(bytes.length(call.calldata)), CALLDATA_LENGTH_LENGTH),
    call.calldata,
  );
}

const parser: EvmScriptParser = { parse, serialize };

export default parser;
