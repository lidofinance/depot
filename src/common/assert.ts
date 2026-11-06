import chai from "chai";

chai.util.addMethod(
  chai.assert,
  "approximately",
  function approximately(
    act: bigint | number,
    exp: bigint | number,
    delta: bigint | number,
    message?: string | undefined,
  ) {
    act = BigInt(act);
    exp = BigInt(exp);
    delta = BigInt(delta);

    const positiveDelta = act > exp ? act - exp : exp - act;
    chai.assert(positiveDelta <= delta, message);
  },
);

export { assert } from "chai";
