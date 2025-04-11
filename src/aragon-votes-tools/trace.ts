import { BaseContract, ContractTransactionReceipt, FunctionFragment } from "ethers";
import { TxTraceItem, TxTraceLogItem } from "../traces/tx-traces";
import providers from "../providers";
import traces from "../traces";
import bytes from "../common/bytes";
import lido from "../lido";
import { Address } from "../common/types";
import { isLogOpcode } from "../traces/evm-opcodes";

export interface MethodCallConfig {
  type?: "CALL" | "DELEGATECALL" | "STATICCALL" | "CALLCODE";
  address: Address;
  fragment?: FunctionFragment;
}

interface TraceOptions {
  extended: boolean;
}

export async function trace(enactReceipt: ContractTransactionReceipt, options: TraceOptions = { extended: false }) {
  const provider = providers.provider(enactReceipt);
  const {
    acl,
    agent,
    kernel,
    callsScript,
    evmScriptRegistry,
    implementations: { kernel: kernelImpl, acl: aclImpl, evmScriptRegistry: evmScriptRegistryImpl },
  } = lido.chainId(await providers.chainId(provider));

  const trace = await traces.trace(enactReceipt);

  if (options.extended) return trace;

  return trace
    .filter(
      omitMethodCalls([
        {
          type: "CALL",
          address: kernel.address,
          fragment: kernel.getFunction("getApp").fragment,
        },
        {
          type: "DELEGATECALL",
          address: kernelImpl.address,
          fragment: kernelImpl.getFunction("getApp").fragment,
        },
        {
          type: "CALL",
          address: kernel.address,
          fragment: kernel.getFunction("hasPermission").fragment,
        },
        {
          type: "DELEGATECALL",
          address: kernelImpl.address,
          fragment: kernelImpl.getFunction("hasPermission").fragment,
        },
        {
          type: "CALL",
          address: evmScriptRegistry.address,
          fragment: evmScriptRegistry.getFunction("getScriptExecutor").fragment,
        },
        {
          type: "DELEGATECALL",
          address: evmScriptRegistryImpl.address,
          fragment: evmScriptRegistryImpl.getFunction("getScriptExecutor").fragment,
        },
        {
          type: "CALL",
          address: acl.address,
          fragment: acl.getFunction("hasPermission(address,address,bytes32)").fragment,
        },
        {
          type: "DELEGATECALL",
          address: aclImpl.address,
          fragment: aclImpl.getFunction("hasPermission(address,address,bytes32)").fragment,
        },
        {
          type: "CALL",
          address: acl.address,
          fragment: acl.getFunction("hasPermission(address,address,bytes32,bytes)").fragment,
        },
        {
          type: "DELEGATECALL",
          address: aclImpl.address,
          fragment: aclImpl.getFunction("hasPermission(address,address,bytes32,bytes)").fragment,
        },
        {
          type: "CALL",
          address: acl.address,
          fragment: acl.getFunction("hasPermission(address,address,bytes32,uint256[])").fragment,
        },
        {
          type: "DELEGATECALL",
          address: aclImpl.address,
          fragment: aclImpl.getFunction("hasPermission(address,address,bytes32,uint256[])").fragment,
        },
        {
          type: "DELEGATECALL",
          address: callsScript.address,
          fragment: callsScript.getFunction("execScript").fragment,
        },
      ]),
    )
    .filter(omitProxyDelegateCalls())
    .filter(omitStaticCalls())
    .filter(omitServiceLogs({ agent, callsScript }));
}

export function omitStaticCalls() {
  return (opCode: TxTraceItem) => {
    return opCode.type !== "STATICCALL";
  };
}

export function omitProxyDelegateCalls() {
  return (txTraceItem: TxTraceItem, i: number, txTraceItems: TxTraceItem[]) => {
    if (txTraceItem.type !== "DELEGATECALL") return true;
    const prevOpcode = txTraceItems[i - 1]!;
    if (prevOpcode.type !== "CALL" && prevOpcode.type !== "STATICCALL") return true;
    return txTraceItem.input !== prevOpcode.input;
  };
}

export function omitMethodCalls(calls: MethodCallConfig[]) {
  return (txTraceItem: TxTraceItem) =>
    !calls.some(
      (call) =>
        call.type === txTraceItem.type &&
        bytes.isEqual(call.address, txTraceItem.address) &&
        (call.fragment ? bytes.isEqual(call.fragment.selector, bytes.slice(txTraceItem.input, 0, 4)) : true),
    );
}

export function omitServiceLogs({ agent, callsScript }: { agent: BaseContract; callsScript: BaseContract }) {
  return (txTraceItem: TxTraceItem) => {
    if (!isLogOpcode(txTraceItem.type)) return true;

    const ti = txTraceItem as TxTraceLogItem;
    if (ti.address === undefined) return true;

    const topics = [ti.topic1, ti.topic2, ti.topic3, ti.topic4].filter((topic) => topic !== undefined) as string[];

    let log = callsScript.interface.parseLog({ topics, data: ti.data });
    if (log && log.name === "LogScriptCall") {
      return false;
    }

    log = agent.interface.parseLog({ topics, data: ti.data });
    return !(log && log.name === "ScriptResult");
  };
}
