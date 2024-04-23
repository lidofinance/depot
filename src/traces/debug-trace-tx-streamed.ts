import fetch from 'node-fetch'
import clarinet from 'clarinet'
import { JsonBuilder } from './json-builder'
import { RawStructLog } from './types'

interface JsonRpcError {
  code: number
  message: string
  data?: any
}

interface StructLogTracerHandlers {
  gas?(gas: number): void
  error?(error: JsonRpcError): void
  structLog?(structLog: RawStructLog): void
  returnValue?(returnValue: string): void
}

export interface TraceParameters {
  disableStack?: boolean | null
  disableStorage?: boolean | null
  enableMemory?: boolean | null
  enableReturnData?: boolean | null
}

const DEFAULT_PARAMS: TraceParameters = {
  enableMemory: false,
  disableStack: false,
  disableStorage: false,
  enableReturnData: false,
}

type RpcNodeName = 'hardhat' | 'anvil' | 'ganache' | 'geth' | 'erigon' | 'other'

export class DebugTraceTxStreamed {
  private requestId: number = 1
  public params: TraceParameters

  constructor(
    private readonly handlers: StructLogTracerHandlers,
    params?: TraceParameters,
  ) {
    this.params = params ?? { ...DEFAULT_PARAMS }
  }

  async trace(url: string, hash: string, params?: TraceParameters) {
    const response = await this.requestTrace(url, hash, params ?? this.params)

    const cparser = clarinet.parser()
    const jsonBuilder = new JsonBuilder()
    let obj: any = null

    cparser.onopenobject = (key?: string) => {
      jsonBuilder.openObject()
      if (key !== undefined) {
        jsonBuilder.key(key)
      }
    }

    cparser.oncloseobject = () => {
      jsonBuilder.closeObject()

      obj = jsonBuilder.pop()

      if (this.handlers?.structLog && this.isStructLog(obj)) {
        this.handlers.structLog(obj)
      }
    }

    cparser.onopenarray = () => jsonBuilder.openArray()
    cparser.onclosearray = () => jsonBuilder.closeArray()
    cparser.onkey = (key: string) => jsonBuilder.key(key)
    cparser.onvalue = (value: string | boolean | null) => jsonBuilder.value(value)

    if (!response.body) {
      throw new Error(`The response body is null ${response}`)
    }

    for await (const chunk of response.body) {
      cparser.write(chunk.toString())
    }
    const { result, error } = obj

    if (result) {
      this.handlers.gas?.(result.gas)
      this.handlers.returnValue?.(result.returnValue)
    }

    if (error) {
      this.handlers.error?.(error)
    }
    cparser.close()
  }

  private isStructLog(log: unknown): log is RawStructLog {
    const asRawLog = log as RawStructLog
    return (
      asRawLog &&
      asRawLog.op !== undefined &&
      asRawLog.depth !== undefined &&
      asRawLog.pc !== undefined &&
      asRawLog.gas !== undefined
    )
  }

  private mapTraceParameters(rpcName: RpcNodeName, params: TraceParameters) {
    if (rpcName === 'ganache' || rpcName === 'hardhat' || rpcName === 'erigon') {
      return {
        disableStack: params.disableStack ?? false,
        disableStorage: params.disableStorage ?? false,
        disableMemory: params.enableMemory === true ? false : true, // disabled by default
        disableReturnData: params.enableReturnData === true ? false : true, // disabled by default
      }
    }
    return {
      disableStack: params.disableStack ?? false,
      disableStorage: params.disableStorage ?? false,
      enableMemory: params.enableMemory ?? false,
      enableReturnData: params.enableReturnData ?? false,
    }
  }

  private async requestTrace(url: string, hash: string, params: TraceParameters) {
    const rpcName = await this.requestNodeType(url)

    // TODO: handle failed requests, for example when tx wasn't found
    return fetch(url, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.requestId++,
        jsonrpc: '2.0',
        method: 'debug_traceTransaction',
        params: [hash, this.mapTraceParameters(rpcName, params)],
      }),
    })
  }

  private async requestNodeType(url: string): Promise<RpcNodeName> {
    const response = await fetch(url, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.requestId++,
        jsonrpc: '2.0',
        method: 'web3_clientVersion',
        params: [],
      }),
    })
    const data = await response.json()
    if (data.error) {
      throw new Error(`JsonRpcError: ${JSON.stringify(data.error)}`)
    }

    if (typeof data.result !== 'string') {
      throw new Error(`JsonRpcError: Unexpected result type`)
    }

    const [name = 'other'] = data.result.toLowerCase().split('/')

    if (name.startsWith('geth')) return 'geth'
    else if (name.startsWith('anvil')) return 'anvil'
    else if (name.startsWith('hardhat')) return 'hardhat'
    else if (name.startsWith('ganache')) return 'ganache'
    else if (name.startsWith('erigon')) return 'erigon'
    return 'other'
  }
}
