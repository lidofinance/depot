import { getEventInfo } from "../events-info";
import { EventInfo, EventsInfoBuilder } from "../types";

interface GrantRoleOptions {
  role: string;
  account: Address;
  sender: Address;
}

function grantRole({ role, account, sender }: GrantRoleOptions): EventsInfoBuilder {
  return ({ contracts }) => [
    getEventInfo({
      name: "RoleGranted",
      contract: contracts.burner,
      args: [role, account, sender],
    }),
  ];
}

type RevokeRoleOptions = GrantRoleOptions;

function revokeRole({ role, account, sender }: RevokeRoleOptions): EventsInfoBuilder {
  return ({ contracts }) => [
    getEventInfo({
      name: "RoleRevoked",
      contract: contracts.burner,
      args: [role, account, sender],
    }),
  ];
}

interface RequestBurnMyStETHForCoverOptions {
  caller: Address;
  burnAmount: bigint;
  newApproval: bigint;
}

function requestBurnMyStETHForCover({
  caller,
  newApproval,
  burnAmount,
}: RequestBurnMyStETHForCoverOptions): EventsInfoBuilder {
  return ({ contracts: { lido, burner } }) => [
    getEventInfo({
      name: "Approval",
      contract: lido,
      args: [caller, burner.address, newApproval],
    }),
    getEventInfo({
      name: "Transfer",
      contract: lido,
      args: [caller, burner.address, burnAmount],
    }),
    getEventInfo({
      name: "TransferShares",
      contract: lido,
      args: [caller, burner.address, burnAmount],
    }),
    getEventInfo({
      name: "StETHBurnRequested",
      contract: burner,
      args: [true, caller, burnAmount, undefined],
    }),
  ];
}

export default { grantRole, revokeRole, requestBurnMyStETHForCover };
