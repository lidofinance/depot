import { FunctionFragment } from "ethers";
import { ContractCallFactory } from "../types";

interface EasyTrackPermission {
  address: Address;
  fragment: FunctionFragment;
}

interface AddEvmScriptFactoryOptions {
  factory: Address;
  permissions: EasyTrackPermission[];
}

function addEvmScriptFactory({
  factory,
  permissions,
}: AddEvmScriptFactoryOptions): ContractCallFactory {
  return ({ addresses, contracts }) => {
    const permissionsEncoded =
      "0x" +
      permissions
        .map((permission) => permission.address.slice(2) + permission.fragment.selector.slice(2))
        .join("");
    return {
      address: addresses.easyTrack,
      calldata: contracts.easyTrack.interface.encodeFunctionData("addEVMScriptFactory", [
        factory,
        permissionsEncoded,
      ]),
    };
  };
}

function removeEvmScriptFactory(factory: Address): ContractCallFactory {
  return ({ addresses, contracts }) => ({
    address: addresses.easyTrack,
    calldata: contracts.easyTrack.interface.encodeFunctionData("removeEVMScriptFactory", [factory]),
  });
}

export default {
  addEvmScriptFactory,
  removeEvmScriptFactory,
};
