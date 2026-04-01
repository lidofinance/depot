import LidoOnHolesky from './lido-on-holesky'
import LidoOnMainnet from './lido-on-mainnet'

export type Lido = typeof LidoOnMainnet | typeof LidoOnHolesky
