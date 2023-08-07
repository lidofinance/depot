import { SUPPORTED_NETWORKS } from "../constants";

export class UnsupportedNetworkError extends Error {
  constructor(networkName: string) {
    super(
      `Network "${networkName}" is not supported. ` +
        `Supported networks: ${SUPPORTED_NETWORKS.join(", ")}`,
    );
  }
}

export class EnvVariableMissingError extends Error {
  constructor(variableName: string) {
    super(`${variableName} ENV variable wasn't set. Please set ${variableName} in the .env file`);
  }
}
