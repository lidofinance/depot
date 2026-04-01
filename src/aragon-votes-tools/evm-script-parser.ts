import bytes, { HexStrPrefixed } from '../common/bytes'
import { Address } from '../common/types'

/**
 * Data of the EVM script call
 * @param contract - address of the contract to call
 * @param calldata - ABI encoded calldata passed with call
 */
export interface EvmCall {
  address: Address
  calldata: HexStrPrefixed
}

type EncodedEvmScript = HexStrPrefixed

interface DecodedEvmScript {
  specId: string
  calls: EvmCall[]
}

const ADDRESS_LENGTH = 20

export class EvmScriptParser {
  public static readonly SPEC_ID_LENGTH = 4
  public static readonly CALLDATA_LENGTH = 4
  public static readonly CALLDATA_LENGTH_LENGTH = 4
  public static readonly DEFAULT_SPEC_ID = '0x00000001'

  public static isValidEvmScript(script: unknown, specId: string = this.DEFAULT_SPEC_ID): script is EncodedEvmScript {
    return bytes.isValid(script) && script.startsWith(specId)
  }

  public static encode(calls: EvmCall[], specId: string = this.DEFAULT_SPEC_ID): HexStrPrefixed {
    const res = calls.reduce((evmScript, call) => bytes.join(evmScript, this.encodeEvmScriptCall(call)), specId)
    return bytes.normalize(res)
  }

  public static decode(evmScript: EncodedEvmScript) {
    const evmScriptLength = bytes.length(evmScript)
    if (evmScriptLength < this.SPEC_ID_LENGTH) {
      throw new Error('Invalid evmScript length')
    }
    const res: Required<DecodedEvmScript> = {
      specId: bytes.slice(evmScript, 0, this.SPEC_ID_LENGTH),
      calls: [],
    }
    let startIndex = this.SPEC_ID_LENGTH
    while (startIndex < evmScriptLength) {
      const contract = bytes.slice(evmScript, startIndex, (startIndex += ADDRESS_LENGTH))
      const calldataLength = bytes.toInt(bytes.slice(evmScript, startIndex, (startIndex += this.CALLDATA_LENGTH)))
      const calldata = bytes.slice(evmScript, startIndex, (startIndex += calldataLength))
      res.calls.push({ address: contract, calldata })
    }

    if (startIndex !== evmScriptLength) {
      throw new Error('Invalid evmScript length')
    }
    return res
  }

  private static encodeEvmScriptCall(call: EvmCall) {
    return bytes.join(
      call.address,
      bytes.padStart(bytes.encode(bytes.length(call.calldata)), this.CALLDATA_LENGTH_LENGTH),
      call.calldata,
    )
  }
}
