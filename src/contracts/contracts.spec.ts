import { assert } from 'chai'
import { BaseContract, Signer } from 'ethers'

import * as factories from '../../typechain-types'

import contracts from './contracts'

const config = {
  acl: {
    impl: {
      factory: factories.ACL__factory,
      address: '0x9f3b9198911054B122fDb865f8A5Ac516201c339',
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: '0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb',
    },
  },
  ldo: {
    impl: {
      factory: factories.MiniMeToken__factory,
      address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    },
    proxy: null,
  },
  nOR: {
    simpleDvt: {
      impl: {
        factory: factories.NodeOperatorsRegistry__factory,
        address: '0x1770044a38402e3CfCa2Fcfa0C84a093c9B42135',
      },
      proxy: {
        factory: factories.AppProxyUpgradeable__factory,
        address: '0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433',
      },
    },
    curatedStakingModule: {
      impl: {
        factory: factories.NodeOperatorsRegistry__factory,
        address: '0x1770044a38402e3CfCa2Fcfa0C84a093c9B42135',
      },
      proxy: {
        factory: factories.AppProxyUpgradeable__factory,
        address: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
      },
    },
  },
} as const

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockSigner = { resolveName: (_) => Promise.resolve('mockSigner') } as Signer
const address = '0x1234567890123456789012345678901234567890'

describe('Contracts', () => {
  it('create contracts from config', async () => {
    const contr = contracts.create(config, mockSigner)

    assert.deepEqual(Object.keys(contr), ['acl', 'ldo', 'nOR', 'proxies', 'implementations'])
    assert.deepEqual(Object.keys(contr.proxies), ['acl', 'nOR'])
    assert.deepEqual(Object.keys(contr.implementations), ['acl', 'nOR'])

    assert.equal(contr.ldo.target, config.ldo.impl.address)
    assert.equal(contr.acl.target, config.acl.proxy.address)
    assert.equal(contr.nOR.curatedStakingModule.target, config.nOR.curatedStakingModule.proxy.address)
    assert.equal(contr.nOR.simpleDvt.target, config.nOR.simpleDvt.proxy.address)

    assert.equal(contr.proxies.acl.target, config.acl.proxy.address)
    assert.equal(contr.proxies.nOR.curatedStakingModule.target, config.nOR.curatedStakingModule.proxy.address)
    assert.equal(contr.proxies.nOR.simpleDvt.target, config.nOR.simpleDvt.proxy.address)

    assert.equal(contr.implementations.acl.target, config.acl.impl.address)
    assert.equal(contr.implementations.nOR.curatedStakingModule.target, config.nOR.curatedStakingModule.impl.address)
    assert.equal(contr.implementations.nOR.simpleDvt.target, config.nOR.curatedStakingModule.impl.address)

    assert.isFunction(contr.implementations.nOR.simpleDvt.activateNodeOperator)
    assert.isFunction(contr.implementations.nOR.curatedStakingModule.activateNodeOperator)

    assert.equal(await contr.ldo?.runner?.resolveName?.(''), 'mockSigner')
    const labelLDO = contracts.label(contr.ldo)
    const labelACL = contracts.label(contr.acl)

    assert.include(labelACL, 'Acl__Proxy')
    assert.include(labelACL, config.acl.proxy.address)

    assert.include(labelLDO, 'Ldo')
    assert.include(labelLDO, config.ldo.impl.address)
  })
  it('get label form non-named contract', () => {
    const label = contracts.label({ target: address } as BaseContract)
    assert.isTrue(label.includes('Contract'))
    assert.isTrue(label.includes(address))
  })
  it('parse string address', () => {
    assert.equal(contracts.address(address), address)
  })
  it('parse BaseContract target address', () => {
    assert.equal(contracts.address({ target: address } as BaseContract), address)
  })
  it('parse BaseContract target address error not a string', () => {
    assert.throws(() => contracts.address({ target: null } as never), /target is not an string instance/)
  })
  it('parse BaseContract target address error invalid address structure', () => {
    assert.throws(() => contracts.address({ target: '0x0' } as BaseContract), /target 0x0 is invalid bytes string/)
  })
  it('parse BaseContract target address error invalid length', () => {
    assert.throws(() => contracts.address({ target: '0x00' } as BaseContract), /target 0x00 is invalid bytes string/)
  })
  it('parse contract address error', () => {
    assert.throws(
      () => contracts.address({ target: '0xH234567890123456789012345678901234567890' } as BaseContract),
      /is invalid bytes string/,
    )
  })
})
