import { Address } from "abitype";

import { AllowedRecipientsRegistry_ABI } from "../../../abi/AllowedRecipientsRegistry.abi";
import { Contract } from "../../contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

type AllowedRecipientsRegistry = Contract<typeof AllowedRecipientsRegistry_ABI>;

interface LimitParametersInput {
  limit: bigint;
  periodDurationMonths: bigint;
  periodStart: bigint;
}

function limitsParametersChanged(registry: AllowedRecipientsRegistry, input: LimitParametersInput): OmnibusCallEvent[] {
  return [
    event(registry, "CurrentPeriodAdvanced", [input.periodStart]),
    event(registry, "LimitsParametersChanged", [input.limit, input.periodDurationMonths]),
  ];
}

function spentAmountChanged(
  registry: AllowedRecipientsRegistry,
  input: { previousSpentAmount: bigint; spentAmount: bigint },
): OmnibusCallEvent[] {
  if (input.previousSpentAmount === input.spentAmount) {
    return [];
  }
  return [event(registry, "SpentAmountChanged", [input.spentAmount])];
}

function recipientAdded(
  registry: AllowedRecipientsRegistry,
  input: { recipient: Address; title: string },
): OmnibusCallEvent[] {
  return [event(registry, "RecipientAdded", [input.recipient, input.title])];
}

export default { limitsParametersChanged, spentAmountChanged, recipientAdded };
