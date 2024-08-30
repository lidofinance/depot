import { EventCheck, FormattedEvmCall } from "../votes";

export interface OmnibusAction {
  title: string;
  getEVMCalls(): FormattedEvmCall[];
  getExpectedEvents(): EventCheck[];
}
