import { JsonRpcProvider } from 'ethers'
import { mapValues, partial } from 'lodash'

import lido from '../../lido'
import networks, { NetworkName } from '../../networks'
import { BindFirstParam } from '../omnibuses'

import checks, { CheckContext } from './checks'

type AppliedChecks = {
  [K in keyof typeof checks]: BindFirstParam<(typeof checks)[K]>
}

function getChecks(network: NetworkName) {
  const url = networks.localRpcUrl('eth')
  const provider = new JsonRpcProvider(url)
  const contracts = lido.eth[network](provider)
  const context: CheckContext = { contracts, provider }

  return mapValues(checks, (checks) => mapValues(checks, (value) => partial(value, context))) as AppliedChecks
}

export default {
  mainnet: getChecks('mainnet'),
  holesky: getChecks('holesky'),
}
