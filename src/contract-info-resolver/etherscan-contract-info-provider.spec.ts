import { assert } from 'chai'
import { randomAddress } from 'hardhat/internal/hardhat-network/provider/utils/random'
import nock from 'nock'

import bytes from '../common/bytes'

import { BUILTIN_ETHERSCAN_CHAINS } from './etherscan-chains-config'
import { EtherscanContractInfoProvider, MAX_ATTEMPTS } from './etherscan-contract-info-provider'

const CHAIN_ID = 1
const ETHERSCAN_API_URL = BUILTIN_ETHERSCAN_CHAINS.find((chain) => chain.chainId === CHAIN_ID)

const FLATTENED_CONTRACT_ADDRESS = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0'
const VYPER_CONTRACT_ADDRESS = '0xed4064f376cb8d68f770fb1ff088a3d0f3ff5c4d'

describe('EtherscanAbiResolver', () => {
  before(() => {
    if (!ETHERSCAN_API_URL) {
      throw new Error(`Etherscan chain config for chain id ${CHAIN_ID} not found`)
    }
  })

  afterEach(() => {
    nock.cleanAll()
  })

  const abiProvider = new EtherscanContractInfoProvider('fake_api_key')

  it('The verified non proxy contract (flattened)', async () => {
    nock(ETHERSCAN_API_URL!.urls.apiURL)
      .get(new RegExp('.*'))
      .reply((uri) => {
        const address = uri
          .split('&')
          .find((q) => q.startsWith('address='))
          ?.replace('address=', '')
        if (!address) {
          throw new Error("Address wasn't passed")
        }
        const response = (ETHERSCAN_RESPONSES_MOCK as Record<string, any>)[address]
        return [200, response]
      })

    const res = await abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS)

    assert.isNotNull(res)

    const etherscanResponse = ETHERSCAN_RESPONSES_MOCK[FLATTENED_CONTRACT_ADDRESS].result[0]
    assert.equal(JSON.stringify(res!.abi), etherscanResponse.ABI)
    assert.equal(res!.compilerVersion, etherscanResponse.CompilerVersion)
    assert.equal(res!.constructorArgs, bytes.normalize(etherscanResponse.ConstructorArguments))
    assert.equal(res!.evmVersion, etherscanResponse.EVMVersion)
    if (etherscanResponse.Implementation === '') {
      assert.isNull(res!.implementation)
    } else {
      assert.equal(res!.implementation, etherscanResponse.Implementation)
    }
    assert.equal(res!.name, etherscanResponse.ContractName)
    assert.equal(
      res!.sourceCode,
      JSON.stringify({
        language: 'Solidity',
        sources: {
          [etherscanResponse.ContractName + '.sol']: etherscanResponse.SourceCode,
        },
        settings: {
          libraries: {},
          outputSelection: {
            '*': {
              '': ['ast'],
              '*': ['metadata', 'evm.bytecode', 'evm.bytecode.sourceMap'],
            },
          },
          evmVersion: etherscanResponse.EVMVersion,
          optimizer: {
            enabled: etherscanResponse.OptimizationUsed === '1',
            runs: etherscanResponse.Runs,
          },
        },
      }),
    )
  })

  it('The verified non proxy contract vyper', async () => {
    nock(ETHERSCAN_API_URL!.urls.apiURL)
      .get(new RegExp('.*'))
      .reply((uri) => {
        const address = uri
          .split('&')
          .find((q) => q.startsWith('address='))
          ?.replace('address=', '')
        if (!address) {
          throw new Error("Address wasn't passed")
        }
        const response = (ETHERSCAN_RESPONSES_MOCK as Record<string, any>)[address]
        return [200, response]
      })

    const res = await abiProvider.request(CHAIN_ID, VYPER_CONTRACT_ADDRESS)

    assert.isNotNull(res)

    const etherscanResponse = ETHERSCAN_RESPONSES_MOCK[VYPER_CONTRACT_ADDRESS].result[0]
    assert.equal(JSON.stringify(res!.abi), etherscanResponse.ABI)
    assert.equal(res!.compilerVersion, etherscanResponse.CompilerVersion)
    assert.equal(res!.constructorArgs, bytes.normalize(etherscanResponse.ConstructorArguments))
    assert.equal(res!.evmVersion, etherscanResponse.EVMVersion)
    if (etherscanResponse.Implementation === '') {
      assert.isNull(res!.implementation)
    } else {
      assert.equal(res!.implementation, etherscanResponse.Implementation)
    }
    assert.equal(res!.name, etherscanResponse.ContractName)
    assert.equal(
      res!.sourceCode,
      JSON.stringify({
        language: 'Solidity',
        sources: {
          [etherscanResponse.ContractName + '.sol']: etherscanResponse.SourceCode,
        },
        settings: {
          libraries: {},
          outputSelection: {
            '*': {
              '': ['ast'],
              '*': ['metadata', 'evm.bytecode', 'evm.bytecode.sourceMap'],
            },
          },
          evmVersion: etherscanResponse.EVMVersion,
          optimizer: {
            enabled: etherscanResponse.OptimizationUsed === '1',
            runs: etherscanResponse.Runs,
          },
        },
      }),
    )
  })

  it('It retries if Etherscan returns rate limit error', async () => {
    let callsCount = 0
    nock(ETHERSCAN_API_URL!.urls.apiURL)
      .get(new RegExp('.*'))
      .times(3)
      .reply(200, () => {
        callsCount++
        return {
          status: '1',
          message: 'OK',
          result: 'Max rate limit reached',
        }
      })
    nock(ETHERSCAN_API_URL!.urls.apiURL)
      .get(new RegExp('.*'))
      .reply((uri) => {
        callsCount++
        const address = uri
          .split('&')
          .find((q) => q.startsWith('address='))
          ?.replace('address=', '')
        if (!address) {
          throw new Error("Address wasn't passed")
        }
        const response = (ETHERSCAN_RESPONSES_MOCK as Record<string, any>)[address]
        return [200, response]
      })
    const res = await abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS)

    assert.isNotNull(res)
    assert.equal(callsCount, 4)
  })

  it('It fails if it have to retry more times than MAX_ATTEMPTS value', async () => {
    nock(ETHERSCAN_API_URL!.urls.apiURL)
      .get(new RegExp('.*'))
      .times(MAX_ATTEMPTS + 1)
      .reply(200, {
        status: '1',
        message: 'OK',
        result: 'Max rate limit reached',
      })

    await assert.isRejected(
      abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS),
      'Rate limit reached, tried 5 times:\nMax rate limit reached',
    )
  })

  it('returns contract info for a verified contract', async () => {
    const mockResponse = {
      status: '1',
      message: 'OK',
      result: [
        {
          SourceCode: 'contract A {}',
          ABI: '[{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}]',
          ContractName: 'Flattened',
          CompilerVersion: 'v0.6.12+commit.27d51765',
          OptimizationUsed: '1',
          Runs: '200',
          ConstructorArguments: '000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84',
          EVMVersion: 'Default',
          Library: '',
          LicenseType: 'GNU GPLv3',
          Proxy: '0',
          Implementation: randomAddress().toString(),
          SwarmSource: 'ipfs://186e50b7fede392854c0f7a5c7a0ca06364c7a59f763103f5fdc8e825f75be23',
        },
      ],
    }
    nock(ETHERSCAN_API_URL!.urls.apiURL).get(new RegExp('.*')).reply(200, mockResponse)

    const res = await abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS)

    assert.isNotNull(res)
    assert.equal(res.name, mockResponse.result[0].ContractName)
    assert.deepEqual(res.abi, JSON.parse(mockResponse.result[0].ABI))
    assert.equal(res.compilerVersion, mockResponse.result[0].CompilerVersion)
    assert.equal(res.constructorArgs, bytes.normalize(mockResponse.result[0].ConstructorArguments))
    assert.equal(res.evmVersion, mockResponse.result[0].EVMVersion)
    assert.equal(res.implementation, bytes.normalize(mockResponse.result[0].Implementation))
    assert.equal(
      res.sourceCode,
      JSON.stringify({
        language: 'Solidity',
        sources: {
          [mockResponse.result[0].ContractName + '.sol']: mockResponse.result[0].SourceCode,
        },
        settings: {
          libraries: {},
          outputSelection: {
            '*': {
              '': ['ast'],
              '*': ['metadata', 'evm.bytecode', 'evm.bytecode.sourceMap'],
            },
          },
          evmVersion: mockResponse.result[0].EVMVersion,
          optimizer: { enabled: mockResponse.result[0].OptimizationUsed === '1', runs: mockResponse.result[0].Runs },
        },
      }),
    )
  })

  it('throws an error for unverified contract', async () => {
    const mockResponse = {
      status: '0',
      message: 'NOTOK',
      result: 'Contract source code not verified',
    }
    nock(ETHERSCAN_API_URL!.urls.apiURL).get(new RegExp('.*')).reply(200, mockResponse)

    await assert.isRejected(abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS), 'Contract is not verified')
  })

  it('throws an error for unsupported chain id', async () => {
    const unsupportedChainId = 9999
    await assert.isRejected(
      abiProvider.request(unsupportedChainId, FLATTENED_CONTRACT_ADDRESS),
      `Unsupported chain id "${unsupportedChainId}"`,
    )
  })

  it('throws an error for unexpected Etherscan response', async () => {
    const mockResponse = {
      status: '1',
      message: 'OK',
      result: 'Unexpected result format',
    }
    nock(ETHERSCAN_API_URL!.urls.apiURL).get(new RegExp('.*')).reply(200, mockResponse)

    await assert.isRejected(
      abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS),
      `Unexpected Etherscan Response: ${JSON.stringify(mockResponse)}`,
    )
  })

  it('retries on rate limit error', async () => {
    const mockResponse = {
      status: '0',
      message: 'NOTOK',
      result: 'Max rate limit reached',
    }
    nock(ETHERSCAN_API_URL!.urls.apiURL).get(new RegExp('.*')).reply(200, mockResponse)

    const secondMockResponse = {
      status: '1',
      message: 'OK',
      result: [
        {
          SourceCode: 'contract A {}',
          ABI: '[{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}]',
          ContractName: 'Flattened',
          CompilerVersion: 'v0.6.12+commit.27d51765',
          OptimizationUsed: '1',
          Runs: '200',
          ConstructorArguments: '000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84',
          EVMVersion: 'Default',
          Library: '',
          LicenseType: 'GNU GPLv3',
          Proxy: '0',
          Implementation: '0x',
          SwarmSource: 'ipfs://186e50b7fede392854c0f7a5c7a0ca06364c7a59f763103f5fdc8e825f75be23',
        },
      ],
    }
    nock(ETHERSCAN_API_URL!.urls.apiURL).get(new RegExp('.*')).reply(200, secondMockResponse)

    const res = await abiProvider.request(CHAIN_ID, FLATTENED_CONTRACT_ADDRESS)

    assert.isNotNull(res)
    assert.equal(res.name, secondMockResponse.result[0].ContractName)
    assert.deepEqual(res.abi, JSON.parse(secondMockResponse.result[0].ABI))
    assert.equal(res.compilerVersion, secondMockResponse.result[0].CompilerVersion)
    assert.equal(res.constructorArgs, bytes.normalize(secondMockResponse.result[0].ConstructorArguments))
    assert.equal(res.evmVersion, secondMockResponse.result[0].EVMVersion)
    assert.equal(res.implementation, bytes.normalize(secondMockResponse.result[0].Implementation))
    assert.equal(
      res.sourceCode,
      JSON.stringify({
        language: 'Solidity',
        sources: { 'Flattened.sol': 'contract A {}' },
        settings: {
          libraries: {},
          outputSelection: { '*': { '': ['ast'], '*': ['metadata', 'evm.bytecode', 'evm.bytecode.sourceMap'] } },
          evmVersion: 'Default',
          optimizer: { enabled: true, runs: '200' },
        },
      }),
    )
  })
})

const ETHERSCAN_RESPONSES_MOCK = {
  [FLATTENED_CONTRACT_ADDRESS]: {
    status: '1',
    message: 'OK',
    result: [
      {
        SourceCode: 'contract A {}',
        ABI: '[{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}]',
        ContractName: 'Flattened',
        CompilerVersion: 'v0.6.12+commit.27d51765',
        OptimizationUsed: '1',
        Runs: '200',
        ConstructorArguments: '000000000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84',
        EVMVersion: 'Default',
        Library: '',
        LicenseType: 'GNU GPLv3',
        Proxy: '0',
        Implementation: '',
        SwarmSource: 'ipfs://186e50b7fede392854c0f7a5c7a0ca06364c7a59f763103f5fdc8e825f75be23',
      },
    ],
  },
  [VYPER_CONTRACT_ADDRESS]: {
    status: '1',
    message: 'OK',
    result: [
      {
        SourceCode:
          '# pragma version ^0.4.0\ngreet: public(String[100])\n@deploy\ndef __init__():\n    self.greet = "Hello World"',
        ABI: '[{"name":"Transfer","inputs":[{"name":"_from","type":"address","indexed":true},{"name":"_to","type":"address","indexed":true},{"name":"_value","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"Approval","inputs":[{"name":"_owner","type":"address","indexed":true},{"name":"_spender","type":"address","indexed":true},{"name":"_value","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"name":"SetName","inputs":[{"name":"old_name","type":"string","indexed":false},{"name":"old_symbol","type":"string","indexed":false},{"name":"name","type":"string","indexed":false},{"name":"symbol","type":"string","indexed":false},{"name":"owner","type":"address","indexed":false},{"name":"time","type":"uint256","indexed":false}],"anonymous":false,"type":"event"},{"stateMutability":"nonpayable","type":"constructor","inputs":[{"name":"_name","type":"string"},{"name":"_symbol","type":"string"}],"outputs":[]},{"stateMutability":"view","type":"function","name":"decimals","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":426},{"stateMutability":"nonpayable","type":"function","name":"transfer","inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"gas":78832},{"stateMutability":"nonpayable","type":"function","name":"transferFrom","inputs":[{"name":"_from","type":"address"},{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"gas":116861},{"stateMutability":"nonpayable","type":"function","name":"approve","inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"gas":39253},{"stateMutability":"nonpayable","type":"function","name":"increaseAllowance","inputs":[{"name":"_spender","type":"address"},{"name":"_added_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"gas":41827},{"stateMutability":"nonpayable","type":"function","name":"decreaseAllowance","inputs":[{"name":"_spender","type":"address"},{"name":"_subtracted_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"gas":41851},{"stateMutability":"nonpayable","type":"function","name":"mint","inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"gas":81071},{"stateMutability":"nonpayable","type":"function","name":"mint_relative","inputs":[{"name":"_to","type":"address"},{"name":"frac","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}],"gas":81475},{"stateMutability":"nonpayable","type":"function","name":"burnFrom","inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"gas":81119},{"stateMutability":"nonpayable","type":"function","name":"set_minter","inputs":[{"name":"_minter","type":"address"}],"outputs":[],"gas":37912},{"stateMutability":"nonpayable","type":"function","name":"set_name","inputs":[{"name":"_name","type":"string"},{"name":"_symbol","type":"string"}],"outputs":[],"gas":232545},{"stateMutability":"view","type":"function","name":"name","inputs":[],"outputs":[{"name":"","type":"string"}],"gas":13223},{"stateMutability":"view","type":"function","name":"symbol","inputs":[],"outputs":[{"name":"","type":"string"}],"gas":10976},{"stateMutability":"view","type":"function","name":"balanceOf","inputs":[{"name":"arg0","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":3188},{"stateMutability":"view","type":"function","name":"allowance","inputs":[{"name":"arg0","type":"address"},{"name":"arg1","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"gas":3490},{"stateMutability":"view","type":"function","name":"totalSupply","inputs":[],"outputs":[{"name":"","type":"uint256"}],"gas":2976},{"stateMutability":"view","type":"function","name":"minter","inputs":[],"outputs":[{"name":"","type":"address"}],"gas":3006}]',
        ContractName: 'Vyper_contract',
        CompilerVersion: 'vyper:0.4.0',
        OptimizationUsed: '0',
        Runs: '0',
        ConstructorArguments: '',
        EVMVersion: 'petersburg',
        Library: '',
        LicenseType: 'None',
        Proxy: '0',
        Implementation: '',
        SwarmSource: '',
        SimilarMatch: '0x3b6831c0077a1e44ED0a21841C3bC4dC11bCE833',
      },
    ],
  },
}
