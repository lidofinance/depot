import { EventFragment } from "ethers";
import { Actions } from "./actions";
import { LidoProtocol, LidoVersion } from "../lido";
import { BytesStringPrefixed } from "../common/bytes";
import { EvmScriptParser } from "./evm-script-parser";

export interface ContractCall {
  address: Address;
  calldata: BytesStringPrefixed;
}

export interface OmnibusContext<T extends LidoVersion> {
  actions: Actions;
  parser: EvmScriptParser;

  proxies: ReturnType<LidoProtocol[T]>["proxies"];
  addresses: ReturnType<LidoProtocol[T]>["addresses"];
  contracts: ReturnType<LidoProtocol[T]>["contracts"];
  implementations: ReturnType<LidoProtocol[T]>["implementations"];
}

export interface ContractCallFactory<V extends LidoVersion = LidoVersion> {
  (ctx: OmnibusContext<V>): ContractCall;
}

export interface OmnibusActionsBuilder<V extends LidoVersion = LidoVersion> {
  (ctx: OmnibusContext<V>): [string, ContractCallFactory<V>][];
}

export interface EventInfo {
  address: Address;
  fragment: EventFragment;
  args?: unknown[];
}

export interface EventsInfoBuilder<T extends LidoVersion = LidoVersion> {
  (lido: Omit<OmnibusContext<T>, "actions" | "parser">): EventInfo[];
}
