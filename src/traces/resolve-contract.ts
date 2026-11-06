import { Address } from "viem";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";
import { Contract } from "../contracts/contracts";
import { NetworkName } from "../network";

// Single contract may have a couple associated contracts if it's proxy
export async function resolveContract(network: NetworkName, address: Address): Promise<Contract[]> {
  const resolvedContract = await ContractInfoResolver.resolve(network, address);
  const implAddress = resolvedContract.implementation;

  if (!implAddress) {
    return [{ address, abi: resolvedContract.abi, label: resolvedContract.name }];
  }

  const resolvedContractImpl = await ContractInfoResolver.resolve(network, implAddress);

  return [
    { address, abi: resolvedContractImpl.abi, label: resolvedContractImpl.name },
    { address, abi: resolvedContract.abi, label: `${resolvedContractImpl.name}__Proxy` },
  ];
}
