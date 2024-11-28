import { mapValues, partial } from "lodash";
import networks, { NetworkName } from "../../networks";
import lido from "../../lido";
import { BindFirstParam } from "../omnibuses";
import { JsonRpcProvider } from "ethers";
import checks, { CheckContext } from "./checks";

type AppliedChecks = {
  [K in keyof typeof checks]: BindFirstParam<(typeof checks)[K]>;
};

function getChecks(network: NetworkName) {
  const url = networks.localRpcUrl("eth");
  const provider = new JsonRpcProvider(url);
  const contracts = lido.eth[network](provider);
  const context: CheckContext = { contracts, provider };

  return mapValues(checks, (checks) => mapValues(checks, (value) => partial(value, context))) as AppliedChecks;
}

export default {
  mainnet: getChecks("mainnet"),
};
