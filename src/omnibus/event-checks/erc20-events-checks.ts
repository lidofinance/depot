import { EventsInfoBuilder } from "../types";

interface ApproveOptions {
  token: Address;
  owner: Address;
  spender: Address;
  amount: bigint;
}

function approve({ token, owner, spender, amount }: ApproveOptions): EventsInfoBuilder {
  return ({ contracts }) => [
    {
      address: token,
      fragment: contracts.lido.interface.getEvent("Approval"),
      args: [owner, spender, amount],
    },
  ];
}

export default {
  approve,
};
