import { BaseContract, EventFragment } from 'ethers'

import { TypedContractEvent } from '../../typechain-types/common'
import { Address } from '../common/types'
import contracts from '../contracts'

import { OverloadedInputResultMap } from './overloaded-types-helper'

export interface EventCheck {
  args?: unknown[]
  address: Address
  fragment: EventFragment
  params?: {
    optional: boolean
  }
}

export interface EventsGroup {
  name: string
  events: EventCheck[]
}

type TypedContract = BaseContract & {
  getEvent(key: string): TypedContractEvent
}

interface MakeEventCheckParams<T extends TypedContract, K extends keyof OverloadedInputResultMap<T['getEvent']>> {
  args?: Parameters<OverloadedInputResultMap<T['getEvent']>[K]['getFragment']>
  emitter?: Address | BaseContract
}

class EventFragmentNotFoundError extends Error {
  constructor(name: string, contract: BaseContract) {
    super(`EventFragment ${name} not found in the ${contracts.label(contract)} (${contracts.address(contract)})`)
  }
}

export function event<T extends TypedContract, K extends keyof OverloadedInputResultMap<T['getEvent']>>(
  contract: T,
  event: K,
  { args, emitter: address }: MakeEventCheckParams<T, K> = {},
  params?: { optional: boolean },
): EventCheck {
  const fragment = contract.getEvent(event as string).fragment
  if (!fragment) {
    throw new EventFragmentNotFoundError(event as string, contract)
  }
  return {
    args,
    fragment,
    address: contracts.address(address ?? contract),
    params,
  }
}
