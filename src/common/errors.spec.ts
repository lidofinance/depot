import { expect } from "chai";
import { isKnownError } from "./errors";
import { NoKeystoreError } from "../hardhat-keystores/named-keystores";

describe("isKnownError function", () => {
  it("returns false for standard Error instances", () => {
    const error = new Error("Test error");
    expect(isKnownError(error)).to.be.false;
  });

  it("returns false for non-error objects", () => {
    const error = { message: "I'm an object, not an error" };
    expect(isKnownError(error)).to.be.false;
  });

  it("returns false for primitive types", () => {
    expect(isKnownError("I'm a string")).to.be.false;
    expect(isKnownError(42)).to.be.false;
    expect(isKnownError(true)).to.be.false;
  });

  it("returns false for null and undefined", () => {
    expect(isKnownError(null)).to.be.false;
    expect(isKnownError(undefined)).to.be.false;
  });

  it("returns true for KnownError implementations", () => {
    const error = new NoKeystoreError();
    expect(isKnownError(error)).to.be.true;
  });
});
