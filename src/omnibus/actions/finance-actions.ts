import { ContractCallFactory } from "../types";

interface NewImmediatePaymentOptions {
  token: Address;
  amount: bigint;
  recipient: Address;
  reference: string;
}

function newImmediatePayment({
  token,
  amount,
  recipient,
  reference,
}: NewImmediatePaymentOptions): ContractCallFactory {
  return ({ addresses, contracts }) => ({
    address: addresses.finance,
    calldata: contracts.finance.interface.encodeFunctionData("newImmediatePayment", [
      token,
      recipient,
      amount,
      reference,
    ]),
  });
}

type ERC20PaymentOptions = Omit<NewImmediatePaymentOptions, "token">;

function makeLdoPayment({
  recipient,
  amount,
  reference,
}: ERC20PaymentOptions): ContractCallFactory {
  return (ctx) =>
    newImmediatePayment({ token: ctx.addresses.ldo, amount, recipient, reference })(ctx);
}

export default {
  makeLdoPayment,
  newImmediatePayment,
};
