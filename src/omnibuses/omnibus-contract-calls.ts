import { Address } from "abitype";
import { decodeFunctionData, getAbiItem, toFunctionSelector } from "viem";

import { IGovernance_ABI } from "../../abi/IGovernance.abi";
import { EvmScriptParser } from "../aragon-votes-tools";
import bytes, { HexStrPrefixed } from "../common/bytes";
import { OmnibusBaseContract } from "../contracts";
import { RpcClient } from "../network";
import { VoteCall } from "./omnibus-types";

/**
 * Selector of the only method the omnibus uses to submit a Dual Governance proposal. Vote items
 * calling it are the ones that produce proposals, and the core has to know which they are to match
 * the submitted proposals with their execution receipts.
 */
export const SUBMIT_PROPOSAL_SELECTOR = toFunctionSelector(
  getAbiItem({ abi: IGovernance_ABI, name: "submitProposal" }),
);

export interface OmnibusContractCalls {
  calls: VoteCall[];
  evmScript: HexStrPrefixed;
}

/**
 * Reads the list of vote items from the deployed omnibus contract and makes sure the EVM script the
 * contract returns is the one built from that very list.
 */
export async function readOmnibusContractCalls(
  client: RpcClient,
  omnibusContract: OmnibusBaseContract,
): Promise<OmnibusContractCalls> {
  if (!omnibusContract.address) {
    throw new Error(`Omnibus contract is not deployed. Make sure "contract.address" property is set.`);
  }

  const [calls, evmScript] = await Promise.all([
    client.read(omnibusContract, "getOmnibusCalls", []),
    client.read(omnibusContract, "getEVMScript", []),
  ]);

  const expectedEvmScript = EvmScriptParser.encode(
    calls.map((call) => ({ address: call.target, calldata: call.payload })),
  );

  if (!bytes.isEqual(expectedEvmScript, evmScript)) {
    throw new Error(`Unexpected EVM script`);
  }

  return { calls: calls as VoteCall[], evmScript };
}

/**
 * A vote item submits a Dual Governance proposal when it calls `submitProposal` on the governance
 * contract. The target is part of the check on purpose: the selector alone would also match a call
 * of the same name on an unrelated contract.
 */
export function isSubmitProposalCall(call: VoteCall, governance: Address): boolean {
  return (
    bytes.isEqual(call.target, governance) && bytes.isEqual(bytes.slice(call.payload, 0, 4), SUBMIT_PROPOSAL_SELECTOR)
  );
}

/**
 * @returns indexes of the vote items submitting Dual Governance proposals, in the order the items
 *   appear in the vote
 */
export function getSubmitProposalCallIndexes(calls: VoteCall[], governance: Address): number[] {
  return calls.reduce<number[]>((indexes, call, index) => {
    if (isSubmitProposalCall(call, governance)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
}

/**
 * @returns the `metadata` argument of `submitProposal` — the description of the proposal, which is
 *   part of the payload the DAO votes on
 */
export function decodeSubmitProposalMetadata(call: VoteCall): string {
  const decoded = decodeFunctionData({ abi: IGovernance_ABI, data: call.payload });

  if (decoded.functionName !== "submitProposal") {
    throw new Error(`Vote item "${call.title}" doesn't call "submitProposal" but "${decoded.functionName}"`);
  }

  const [, metadata] = decoded.args;
  return metadata;
}
