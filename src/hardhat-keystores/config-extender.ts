import path from 'path'

import { ConfigExtender } from 'hardhat/types'

import './config-type-extensions'

export const configExtender: ConfigExtender = (config, userConfig) => {
  const keystorePath = userConfig.keystores?.path

  if (keystorePath === undefined) {
    config.keystores.path = path.join(config.paths.root, 'keystores')
    return
  }

  if (path.isAbsolute(keystorePath)) {
    config.keystores.path = keystorePath
    return
  }

  // We resolve relative paths starting from the project's root.
  config.keystores.path = path.normalize(path.join(config.paths.root, keystorePath))
}
