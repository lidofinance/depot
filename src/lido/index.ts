import { NetworkName } from '../networks'

import lido from './lido'

export type LidoContracts = typeof lido
export type LidoEthContracts<T extends NetworkName = NetworkName> = ReturnType<LidoContracts['eth'][T]>

export default lido
