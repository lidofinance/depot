import { Address } from "abitype";

import { Agent_ABI } from "../../../abi/Agent.abi";
import { ERC20_ABI } from "../../../abi/ERC20.abi";
import { Finance_ABI } from "../../../abi/Finance.abi";
import { Lido_ABI } from "../../../abi/Lido.abi";
import { Contract } from "../../contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

interface PaymentContracts {
  finance: Contract<typeof Finance_ABI>;
  vault: Contract<typeof Agent_ABI>;
  token: Contract;
}

interface PaymentInput {
  recipient: Address;
  amount: bigint;
  reference: string;
}

interface StethPaymentContracts extends Omit<PaymentContracts, "token"> {
  steth: Contract<typeof Lido_ABI>;
}

function tokenPaid({ finance, vault, token }: PaymentContracts, input: PaymentInput): OmnibusCallEvent[] {
  return [
    event(finance, "NewPeriod", [null, null, null], { isOptional: true, allowMultiple: true }),
    event(finance, "NewTransaction", [null, false, input.recipient, input.amount, input.reference]),
    event({ ...token, abi: ERC20_ABI }, "Transfer", [vault.address, input.recipient, input.amount]),
    event(vault, "VaultTransfer", [token.address, input.recipient, input.amount]),
  ];
}

function stethPaid(
  { finance, vault, steth }: StethPaymentContracts,
  input: PaymentInput & { shares: bigint },
): OmnibusCallEvent[] {
  return [
    event(finance, "NewPeriod", [null, null, null], { isOptional: true, allowMultiple: true }),
    event(finance, "NewTransaction", [null, false, input.recipient, input.amount, input.reference]),
    event(steth, "Transfer", [vault.address, input.recipient, input.amount]),
    event(steth, "TransferShares", [vault.address, input.recipient, input.shares]),
    event(vault, "VaultTransfer", [steth.address, input.recipient, input.amount]),
  ];
}

export default { tokenPaid, stethPaid };
