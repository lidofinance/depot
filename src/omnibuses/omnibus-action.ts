import { EventCheck, FormattedEvmCall } from "../votes";

export interface OmnibusAction {
  title: string;
  EVMCalls: FormattedEvmCall[];
  expectedEvents: EventCheck[];
}
