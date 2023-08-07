import { EventInfo, EventsInfoBuilder } from "../types";

interface TransferERC20Options {
  to: Address;
  token: Address;
  amount: bigint;
}

function transferERC20({ to, token, amount }: TransferERC20Options): EventsInfoBuilder {
  return ({ contracts, addresses }) => {
    const eventsChain: EventInfo[] = [
      {
        address: token,
        fragment: contracts.lido.interface.getEvent("Transfer"),
        args: [addresses.insuranceFund, to, amount],
      },
    ];
    if (token.toLowerCase() === addresses.lido.toLowerCase()) {
      eventsChain.push({
        address: token,
        fragment: contracts.lido.interface.getEvent("TransferShares"),
        args: [addresses.insuranceFund, to, undefined],
      });
    }
    eventsChain.push({
      address: addresses.insuranceFund,
      fragment: contracts.insuranceFund.interface.getEvent("ERC20Transferred"),
      args: [token, addresses.agent, amount],
    });
    return eventsChain;
  };
}

export default {
  transferERC20,
};
