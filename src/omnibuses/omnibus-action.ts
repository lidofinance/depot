import { EventCheck, FormattedEvmCall } from "../votes";

export interface OmnibusAction {
  title: string;
  evmCall: FormattedEvmCall;
  expectedEvents: EventCheck[];
}
