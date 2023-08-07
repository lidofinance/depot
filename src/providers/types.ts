import { Provider } from "ethers";

export interface SendProvider extends Provider {
  send(method: string, params: any[]): Promise<any>;
}

export interface ProviderExtender<P extends Provider = Provider, E = unknown> {
  extend(provider: P): P & E;
}
