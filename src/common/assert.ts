import chai from "chai";
import { BigNumberish } from "ethers";

chai.util.addMethod(
  chai.assert,
  "approximately",
  function approximately(
    act: BigNumberish,
    exp: BigNumberish,
    delta: BigNumberish,
    message?: string | undefined,
  ) {
    act = BigInt(act);
    exp = BigInt(exp);
    delta = BigInt(delta);

    const positiveDelta = act > exp ? act - exp : exp - act;
    chai.assert(positiveDelta <= delta, message);
  },
);

chai.util.addMethod(chai.assert, "contains", function contains<
  T = any,
>(collection: Iterable<T>, item: T, comparator: (a: T, b: T) => boolean = (a, b) => a === b) {
  for (const colItem of collection) {
    if (comparator(colItem, item)) {
      return;
    }
  }
  chai.assert(false, `Item ${item} is missing in the collection ${collection}`);
});

export { assert } from "chai";
