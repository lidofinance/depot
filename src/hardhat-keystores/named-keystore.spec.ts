import { expect } from 'chai'
import { encrypt } from 'web3-eth-accounts'

import bytes from '../common/bytes'
import { PrivateKey } from '../common/types'

import { NamedKeystore } from './named-keystore'
import { getRandomPrivateKey } from './test_helpers'

describe('NamedKeystore', () => {
  const name = 'test'
  const mainPass = 'pass_word'

  it('creates a NamedKeystore from a private key', async () => {
    const privateKey = getRandomPrivateKey()
    const ks = await encrypt(privateKey, mainPass)

    const namedKeystore = await NamedKeystore.fromPrivateKey(name, privateKey, mainPass)

    expect(namedKeystore).to.be.instanceOf(NamedKeystore)
    expect(namedKeystore.name).to.equal(name)
    expect(namedKeystore.address).to.equal(bytes.normalize(ks.address))
  })

  it('generates a NamedKeystore', async () => {
    const namedKeystore = await NamedKeystore.generate(name, mainPass)

    expect(namedKeystore).to.be.instanceOf(NamedKeystore)
  })

  it('decrypts the NamedKeystore', async () => {
    const privateKey = getRandomPrivateKey()
    const keystore = await encrypt(privateKey, 'pass_word')
    const namedKeystore = new NamedKeystore(name, keystore)

    const decryptedPrivateKey = await namedKeystore.decrypt(mainPass)

    expect(decryptedPrivateKey).to.equal(privateKey)
  })

  it('converts NamedKeystore to JSON excluding name', async () => {
    const privateKey = getRandomPrivateKey()
    const keystore = await encrypt(privateKey, 'pass_word')
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

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, mainPass)).to.be.rejectedWith('Name is empty')
  })

  it('throws an error for an invalid private key', async () => {
    const privateKey = '0xinvalid'

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, mainPass)).to.be.rejectedWith(
      'Private key is not a valid hex string',
    )
  })

  it('throws an error for private key with a wrong length', async () => {
    const privateKey = getRandomPrivateKey().slice(2, -2) as PrivateKey

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, mainPass)).to.be.rejectedWith(
      'Invalid private key length',
    )
  })

  it('throws an error for an empty password', async () => {
    const privateKey = getRandomPrivateKey()

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, '')).to.be.rejectedWith('Password is empty')
  })
})
