import { BaseContract, BytesLike, FunctionFragment, isHexString } from "ethers";

import contracts from "../contracts";
import bytes, { HexStrPrefixed } from "../common/bytes";
import { EvmCall, EvmScriptParser } from "./evm-script-parser";
import { TypedContractMethod } from "../../typechain-types/common";

type _TypedContractMethod = Omit<TypedContractMethod, "staticCallResult">;
type _TypedContractArgs<T extends _TypedContractMethod> = Parameters<T["staticCall"]>;

type ForwardContractMethod = TypedContractMethod<[_evmScript: BytesLike], [void], "nonpayable">;
export interface AragonForwarder extends BaseContract {
  forward: ForwardContractMethod;
}

export interface FormattedEvmCall extends EvmCall {
  format(padding?: number): string;
}

export class AragonEvmForward implements FormattedEvmCall {
  constructor(
    private readonly forwarder: AragonForwarder,
    private readonly calls: ContractEvmCall[],
  ) {}

  get address(): Address {
    return contracts.address(this.forwarder);
  }

  get calldata(): HexStrPrefixed {
    return bytes.normalize(
      this.forwarder.interface.encodeFunctionData("forward", [evm(...this.calls)]),
    );
  }

  format(padding: number = 0): string {
    const label = contracts.label(this.forwarder);

    const methodName = this.forwarder.forward.name;
    const argNames = this.forwarder.forward.fragment.inputs
      .map((input) => input.type + " " + input.name)
      .join(", ");
    const signature = `${label}.${methodName}(${argNames})`;

    const subcalls = this.calls.map((call) => call.format(padding + 4));
    return [
      padLeft(signature, padding),
      padLeft("Parsed EVM Script calls:", padding + 2),
      ...subcalls,
    ].join("\n");
  }
}

export class ContractEvmCall implements FormattedEvmCall {
  constructor(
    private readonly contract: BaseContract,
    private readonly method: FunctionFragment,
    private readonly args: any[],
  ) {}

  get address(): Address {
    return contracts.address(this.contract);
  }

  get calldata(): HexStrPrefixed {
    return bytes.normalize(
      this.contract.interface.encodeFunctionData(
        this.method,
        this.args.map((arg) => (arg && arg.target ? arg.target : arg)),
      ),
    );
  }

  format(padding: number = 0): string {
    const label = contracts.label(this.contract);
    const methodName = this.method.name;
    const argNames = this.method.inputs.map((input) => input.type).join(", ");
    const signature = padLeft(`${label}.${methodName}(${argNames})`, padding);
    const args = this.method.inputs.map((input, index) =>
      padLeft(`  ${input.name}: ${this.formatArgument(this.args[index])}`, padding),
    );
    return [signature, ...args].join("\n");
  }

  private formatArgument(arg: unknown) {
    if (arg instanceof BaseContract) {
      return contracts.label(arg);
    }
    return arg;
  }
}

function padLeft(str: string, padding: number) {
  return " ".repeat(padding) + str;
}

/**
 *
 * @param calls - calls to encode as EVM script
 * @returns EVM script for the sequence of the calls
 */
export function evm(...calls: EvmCall[]): HexStrPrefixed {
  return EvmScriptParser.encode(calls);
}

/**
 * Creates an instance of the EVM call
 * @param method - method on the contract to call
 * @param args - args to use with the contract call
 * @returns an instance of the EVM call
 */
export function call<T extends _TypedContractMethod>(
  method: T,
  args: _TypedContractArgs<T>,
): ContractEvmCall {
  const contract: unknown = (method as any)._contract;

  if (!contract) {
    throw new Error(`Method does not have property _contract`);
  }

  if (!(contract instanceof BaseContract)) {
    throw new Error(`_contract is not an BaseContract instance`);
  }

  const address = contract.target;

  if (typeof address !== "string" || !isHexString(address)) {
    throw new Error(`contract.target must contain valid address, but received ${address}`);
  }

  return new ContractEvmCall(contract, method.fragment, args);
}

/**
 * Creates a call of the forward(evmScript) method
 * @param forwarder - contracts which support forwarding of the EVM scripts
 * @param calls - calls to pass encode as EVM Script and pass as and argument to forward method
 * @returns instance of the EVMCall with forward method call
 */
export function forward(forwarder: AragonForwarder, calls: ContractEvmCall[]): AragonEvmForward {
  return new AragonEvmForward(forwarder, calls);
}
