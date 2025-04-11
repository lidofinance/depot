import * as env from '../common/env'

import pinata from './pinata'

export const getIpfsProvider = () => {
  if (env.PINATA_JWT()) {
    return pinata.getProvider()
  }
  return null
}

export const instruction =
  'you need to add env variable PINATA_JWT, you could get JWT it at https://pinata.cloud site for free'
