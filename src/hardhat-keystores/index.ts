import { extendConfig, extendEnvironment } from 'hardhat/config'
import { configExtender } from './config-extender'
import { environmentExtender } from './environment-extender'

import './tasks'
extendConfig(configExtender)
extendEnvironment(environmentExtender)
