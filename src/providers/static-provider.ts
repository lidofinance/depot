import { Provider, Network } from "ethers";
import { ProviderExtender } from "./types";

interface StaticProviderExtension {
  network: Network;
}

export type StaticProvider<T extends Provider = Provider> = T & StaticProviderExtension;

export class StaticProviderExtender<T extends Provider>
  implements ProviderExtender<T, StaticProviderExtension>
{
  private readonly network: Network;

  constructor(network: Network) {
    this.network = network;
  }

  public static safeCast<T extends Provider = Provider>(provider: T): StaticProvider<T> {
    if ((provider as StaticProvider<T>).network !== undefined) {
      return provider as StaticProvider<T>;
    }
    throw new Error("Unsupported provider");
  }

  public extend(provider: T): StaticProvider<T> {
    const getNetwork = provider.getNetwork.bind(provider);
    const network = this.network.clone();
    return Object.assign(provider, {
      network,
      async getNetwork() {
        const actualNetwork = await getNetwork();
        // in case we ran on hardhat node
        if (actualNetwork.name === "hardhat") return network;
        if (actualNetwork.name !== network.name) {
          throw new Error(
            `Invalid network name. Expected ${network.name}, actual ${actualNetwork.name}`,
          );
        }
        return actualNetwork;
      },
    });
  }
}
