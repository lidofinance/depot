import bytes, { HexStrPrefixed } from "../common/bytes";
import { Address } from "viem";

interface EvmCall {
  address: Address;
  calldata: HexStrPrefixed;
}

type EncodedEvmScript = HexStrPrefixed;

interface DecodedEvmScript {
  specId: string;
  calls: EvmCall[];
}

const SPEC_ID = "0x00000001";
const SPEC_ID_LENGTH = 4;
const ADDRESS_LENGTH = 20;
const CALLDATA_LENGTH_LENGTH = 4;

export class EvmScriptParser {
  public static isValidEvmScript(script: unknown): script is EncodedEvmScript {
    return bytes.isValid(script) && script.startsWith(SPEC_ID);
  }

  public static encode(calls: EvmCall[]): HexStrPrefixed {
    const res = calls.reduce((evmScript, call) => bytes.join(evmScript, this.encodeEvmScriptCall(call)), SPEC_ID);
    return bytes.normalize(res);
  }

  public static decode(evmScript: EncodedEvmScript) {
    const evmScriptLength = bytes.length(evmScript);
    if (evmScriptLength < SPEC_ID_LENGTH) {
      throw new Error("Invalid evmScript length");
    }
    const res: Required<DecodedEvmScript> = {
      specId: bytes.slice(evmScript, 0, SPEC_ID_LENGTH),
      calls: [],
    };
    let startIndex = SPEC_ID_LENGTH;
    while (startIndex < evmScriptLength) {
      const contract = bytes.slice(evmScript, startIndex, (startIndex += ADDRESS_LENGTH));
      const calldataLength = bytes.toInt(bytes.slice(evmScript, startIndex, (startIndex += CALLDATA_LENGTH_LENGTH)));
      const calldata = bytes.slice(evmScript, startIndex, (startIndex += calldataLength));
      res.calls.push({ address: contract, calldata });
    }

    if (startIndex !== evmScriptLength) {
      throw new Error("Invalid evmScript length");
    }
    return res;
  }

  private static encodeEvmScriptCall(call: EvmCall) {
    return bytes.join(
      call.address,
      bytes.padStart(bytes.encode(bytes.length(call.calldata)), CALLDATA_LENGTH_LENGTH),
      call.calldata,
    );
  }
}
