import { lazyObject } from 'hardhat/plugins'
import { EnvironmentExtender } from 'hardhat/types'

import './runtime-type-extensions'
import { create } from './named-keystores'
import { NamedKeystoresStorage } from './named-keystores-storage'

export const environmentExtender: EnvironmentExtender = (hre) => {
  hre.keystores = lazyObject(() => create(NamedKeystoresStorage.create(hre.config.keystores.path)))
}
