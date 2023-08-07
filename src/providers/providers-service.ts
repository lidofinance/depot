import { JsonRpcProvider, Network } from "ethers";

import env from "../common/env";
import { ProviderExtender, SendProvider } from "./types";
import { StaticProvider, StaticProviderExtender } from "./static-provider";
import { LocalProvider, LocalProviderExtender } from "./local-provider";
import { UnsupportedNetworkError } from "../common/errors";
import { SUPPORTED_NETWORKS } from "../constants";

type ExtendResult<E extends ProviderExtender> = ReturnType<E["extend"]>;

function extend<T extends SendProvider, E1 extends ProviderExtender<T>>(
  provider: T,
  extenders: [E1],
): ExtendResult<E1>;
function extend<
  T extends SendProvider,
  E1 extends ProviderExtender<T>,
  E2 extends ProviderExtender<T>,
>(provider: T, extenders: [E1, E2]): ExtendResult<E1> & ExtendResult<E2>;
function extend<
  T extends SendProvider,
  E1 extends ProviderExtender<T>,
  E2 extends ProviderExtender<T>,
  E3 extends ProviderExtender<T>,
>(provider: T, extenders: [E1, E2, E3]): ExtendResult<E1> & ExtendResult<E2> & ExtendResult<E3>;
function extend<
  T extends SendProvider,
  E1 extends ProviderExtender<T>,
  E2 extends ProviderExtender<T>,
  E3 extends ProviderExtender<T>,
  E4 extends ProviderExtender<T>,
>(
  provider: T,
  extenders: [E1, E2, E3, E4],
): ExtendResult<E1> & ExtendResult<E2> & ExtendResult<E3> & ExtendResult<E4>;
function extend<T extends SendProvider>(provider: T, extenders: ProviderExtender<T>[]) {
  return extenders.reduce((provider, extender) => extender.extend(provider), provider);
}

function supports(networkName: string): networkName is NetworkName  {
  return SUPPORTED_NETWORKS.includes(networkName as NetworkName);
}

function createNetwork(networkName: NetworkName) {
  if (networkName === "goerli") return new Network("goerli", 5);
  if (networkName === "mainnet") return new Network("mainnet", 1);
  if (networkName === "sepolia") return new Network("sepolia", 11155111);
  throw new UnsupportedNetworkError(networkName);
}

function rpcUrl(networkName: NetworkName) {
  const rpcUrl = env.RPC_URL();
  if (rpcUrl) return rpcUrl;

  const infuraToken = env.INFURA_TOKEN();
  if (infuraToken) {
    const infuraRpcUrl = `https://${networkName}.infura.io/v3/${infuraToken}`;
    return infuraRpcUrl;
  }

  const alchemyToken = env.ALCHEMY_TOKEN();
  if (alchemyToken) {
    const alchemyRpcUrl = `https://eth-${networkName}.g.alchemy.com/v2/${alchemyToken}`;
    return alchemyRpcUrl;
  }

  throw new Error(
    "RPC node credential was not provided. Please, set one of " +
      "RPC_URL, INFURA_TOKEN or ALCHEMY_TOKEN env variables",
  );
}

function create(
  networkName: NetworkName,
  options: { fork: true },
): LocalProvider<StaticProvider<JsonRpcProvider>>;
function create(
  networkName: NetworkName,
  options: { fork: false },
): StaticProvider<JsonRpcProvider>;
function create(networkName: NetworkName, options: { fork: boolean }) {
  const network = createNetwork(networkName);
  const url = options.fork ? env.LOCAL_RPC_URL() : rpcUrl(networkName);

  const provider = extend(new JsonRpcProvider(url, network), [
    new StaticProviderExtender<JsonRpcProvider>(network),
  ]);

  return options.fork
    ? extend(provider, [new LocalProviderExtender<StaticProvider<JsonRpcProvider>>()])
    : provider;
}

export default {
  rpcUrl,
  extend,
  create,
  supports,
};
