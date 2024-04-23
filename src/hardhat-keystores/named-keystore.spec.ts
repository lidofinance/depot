import { expect } from 'chai'
import { NamedKeystore } from './named-keystore'
import { encrypt } from 'web3-eth-accounts'
import { PrivateKey } from '../common/types'
import * as crypto from 'node:crypto'

const getRandomPrivateKey = (): PrivateKey => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `0x${bytes.reduce((o, v) => o + ('00' + v.toString(16)).slice(-2), '')}`
}

describe('NamedKeystore', () => {
  it('creates a NamedKeystore from a private key', async () => {
    const name = 'test'
    const privateKey = getRandomPrivateKey()
    const password = 'password'

    const namedKeystore = await NamedKeystore.fromPrivateKey(name, privateKey, password)

    expect(namedKeystore).to.be.instanceOf(NamedKeystore)
  })

  it('generates a NamedKeystore', async () => {
    const name = 'test'
    const password = 'password'

    const namedKeystore = await NamedKeystore.generate(name, password)

    expect(namedKeystore).to.be.instanceOf(NamedKeystore)
  })

  it('decrypts the NamedKeystore', async () => {
    const name = 'test'
    const privateKey = getRandomPrivateKey()
    const keystore = await encrypt(privateKey, 'password')
    const password = 'password'
    const namedKeystore = new NamedKeystore(name, keystore)

    const decryptedPrivateKey = await namedKeystore.decrypt(password)

    expect(decryptedPrivateKey).to.equal(privateKey)
  })

  it('converts NamedKeystore to JSON excluding name', async () => {
    const name = 'test'
    const privateKey = getRandomPrivateKey()
    const keystore = await encrypt(privateKey, 'password')
    const namedKeystore = new NamedKeystore(name, keystore)

    const json = namedKeystore.toJson()

    const parsedJson = JSON.parse(json)
    expect(parsedJson).to.have.property('id')
    expect(parsedJson).to.have.property('address')
    expect(parsedJson).to.have.property('crypto')
    expect(parsedJson).to.not.have.property('name')
  })

  it('throws an error for an empty name', async () => {
    const name = ''
    const privateKey = getRandomPrivateKey()
    const password = 'password'

    try {
      await NamedKeystore.fromPrivateKey(name, privateKey, password)
    } catch (err: any) {
      expect(err).to.be.instanceOf(Error)
      expect(err.message).to.equal('Name is empty')
    }
  })

  it('throws an error for an invalid private key', async () => {
    const name = 'test'
    const privateKey = '0xinvalid'
    const password = 'password'

    try {
      await NamedKeystore.fromPrivateKey(name, privateKey, password)
    } catch (err: any) {
      expect(err).to.be.instanceOf(Error)
      expect(err.message).to.equal('Private key is not a valid hex string')
    }
  })

  it('throws an error for private key with a wrong length', async () => {
    const name = 'test'
    const privateKey = getRandomPrivateKey().slice(2, -2) as PrivateKey
    const password = 'password'

    try {
      await NamedKeystore.fromPrivateKey(name, privateKey, password)
    } catch (err: any) {
      expect(err).to.be.instanceOf(Error)
      expect(err.message).to.equal('Invalid private key length')
    }
  })

  it('throws an error for an empty password', async () => {
    const name = 'test'
    const privateKey = getRandomPrivateKey()
    const password = ''

    try {
      await NamedKeystore.fromPrivateKey(name, privateKey, password)
    } catch (err: any) {
      expect(err).to.be.instanceOf(Error)
      expect(err.message).to.equal('Password is empty')
    }
  })
})
