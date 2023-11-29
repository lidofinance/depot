import { NamedContract } from "../../contracts";
import { OmnibusAction, OmnibusTestContext, TitledEventChecks, TitledEvmCall } from "../omnibus";

interface MakePaymentInput {
  token: Address | NamedContract;
  recipient: Address | NamedContract;
  amount: bigint;
  reference: string;
}

export class MakePayment extends OmnibusAction<MakePaymentInput> {
  calls(): TitledEvmCall[] {
    throw new Error("Method not implemented.");
  }
  events(): TitledEventChecks[] {
    throw new Error("Method not implemented.");
  }
  test(ctx: OmnibusTestContext): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
