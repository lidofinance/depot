import LidoOnMainnet from "./lido-on-mainnet";
import LidoOnGoerli from "./lido-on-goerli";

export type Lido = typeof LidoOnMainnet | typeof LidoOnGoerli;
