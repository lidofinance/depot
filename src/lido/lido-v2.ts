import { Provider, ContractRunner } from "ethers";
import { ContractsConfig } from "../contracts/types";
import contracts, {
  Addresses,
  Contracts,
  Proxies,
  Implementations,
} from "../contracts/contracts-service";

import LIDO_ON_MAINNET from "../../configs/lido-on-mainnet";
import LIDO_ON_GOERLI from "../../configs/lido-on-goerli";
import { StaticProvider } from "../providers";
import { UnsupportedNetworkError } from "../common/errors";

interface Instance<C extends ContractsConfig> {
  proxies: Proxies<C>;
  addresses: Addresses<C>;
  contracts: Contracts<C>;
  implementations: Implementations<C>;
}

type LidoInstance = Instance<typeof LIDO_ON_MAINNET | typeof LIDO_ON_GOERLI>;

function config(networkName: string) {
  if (networkName === "goerli") return LIDO_ON_GOERLI;
  if (networkName === "mainnet") return LIDO_ON_MAINNET;
  throw new UnsupportedNetworkError(networkName);
}

function makeLidoInstance(
  config: typeof LIDO_ON_MAINNET | typeof LIDO_ON_GOERLI,
  runner?: ContractRunner,
): LidoInstance {
  return {
    proxies: contracts.proxies(config, runner),
    addresses: contracts.addresses(config),
    contracts: contracts.contracts(config, runner),
    implementations: contracts.implementations(config, runner),
  };
}

function lidoV2(networkName: NetworkName): LidoInstance;
function lidoV2<T extends StaticProvider<Provider>>(provider: T): LidoInstance;
function lidoV2<T extends StaticProvider<Provider>>(networkNameOrProvider: T | NetworkName) {
  const networkName =
    typeof networkNameOrProvider === "string"
      ? networkNameOrProvider
      : networkNameOrProvider.network.name;

  return makeLidoInstance(
    config(networkName),
    typeof networkNameOrProvider === "string" ? undefined : networkNameOrProvider,
  );
}

export default lidoV2;
