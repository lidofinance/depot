import { JsonRpcProvider } from 'ethers'

import { Lido } from '../../../configs/types'
import { Contracts } from '../../contracts/contracts'

import easyTrack from './easy-track'
import events from './events'
import stakingRouter from './staking-router'
import tokens from './tokens'

export interface CheckContext {
  contracts: Contracts<Lido>
  provider: JsonRpcProvider
}

export default {
  easyTrack,
  events,
  stakingRouter,
  tokens,
}
