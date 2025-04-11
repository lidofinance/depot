import sinon from 'sinon'

import { assert } from '../common/assert'

import { ContractInfoResolver } from './contract-info-resolver'

const CHAIN_ID = 1
const FLATTENED_CONTRACT_ADDRESS = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0'

describe('ContractInfoResolver', () => {
  const mockResponse = {
    name: 'Flattened',
    abi: [],
    compilerVersion: 'v0.6.12+commit.27d51765',
    constructorArgs: '000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84',
    evmVersion: 'Default',
    implementation: null,
    sourceCode: 'contract A {}',
  }
  const mockProvider = {
    request: sinon.stub().resolves(mockResponse),
  }

  const mockCache = {
    get: sinon.stub().resolves(null),
    set: sinon.stub().resolves(),
  }

  afterEach(() => {
    mockCache.get.resetHistory()
    mockCache.set.resetHistory()
    mockProvider.request.resetHistory()
  })

  it('resolves contract info and caches the result when cache is enabled', async () => {
    const resolver = new ContractInfoResolver({ contractInfoProvider: mockProvider, cache: mockCache }, true)
    const res = await resolver.resolve(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS)

    assert.deepEqual(res, mockResponse as any)
    assert.isTrue(mockCache.set.calledOnceWith(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS, mockResponse))
  })

  it('returns cached contract info if available', async () => {
    mockCache.get = sinon.stub().resolves(mockResponse)
    const resolver = new ContractInfoResolver({ contractInfoProvider: mockProvider, cache: mockCache }, true)

    const res = await resolver.resolve(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS)

    assert.deepEqual(res, mockResponse as any)
    assert.isTrue(mockProvider.request.notCalled)
  })

  it('throws an error if provider resolve fails', async () => {
    mockCache.get.resolves(null)
    mockProvider.request.rejects(new Error('Provider error'))

    const resolver = new ContractInfoResolver({ contractInfoProvider: mockProvider, cache: mockCache })

    await assert.isRejected(resolver.resolve(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS), 'Provider error')
  })

  it('does not use cache if ETHERSCAN_CACHE_ENABLED is false', async () => {
    process.env.ETHERSCAN_CACHE_ENABLED = 'false'
    mockProvider.request.resolves(mockResponse)
    const resolver = new ContractInfoResolver({ contractInfoProvider: mockProvider, cache: mockCache })

    const res = await resolver.resolve(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS)

    assert.deepEqual(res, mockResponse as any)
    assert.isTrue(mockProvider.request.calledOnce)
    assert.isTrue(mockCache.get.notCalled)
    assert.isTrue(mockCache.set.notCalled)
  })
})
