import { UnsupportedNetworkError } from "./errors";

function getBaseUrl(network: NetworkName) {
  if (network === "mainnet") return "https://etherscan.io";
  if (network === "goerli") return "https://goerli.etherscan.io";
  if (network === "sepolia") return "https://sepolia.etherscan.io";
  throw new UnsupportedNetworkError(network);
}

function getApiUrl(network: NetworkName) {
  switch (network) {
    case "mainnet":
      return "https://api.etherscan.io/api";
    case "goerli":
      return "https://api-goerli.etherscan.io/api";
    case "sepolia":
      return "https://api-sepolia.etherscan.io/api";
    default:
      throw new Error(`Unsupported network "${network}"`);
  }
}

function getAddressUrl(network: NetworkName, address: Address) {
  return getBaseUrl(network) + `/address/${address}`;
}

export default {
  getApiUrl,
  getBaseUrl,
  getAddressUrl,
};
