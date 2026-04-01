import 'hardhat/types/runtime'
import type { NamedKeystores } from './named-keystores'

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    keystores: NamedKeystores
  }
}
