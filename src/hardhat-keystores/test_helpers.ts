import crypto from 'node:crypto'

import { PrivateKey } from '../common/types'

export const getRandomPrivateKey = (): PrivateKey => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `0x${bytes.reduce((o, v) => o + ('00' + v.toString(16)).slice(-2), '')}`
}
