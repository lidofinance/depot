import LidoOnMainnet from "./lido-on-mainnet";
import LidoOnHolesky from "./lido-on-holesky";

export type Lido = typeof LidoOnMainnet | typeof LidoOnHolesky;
