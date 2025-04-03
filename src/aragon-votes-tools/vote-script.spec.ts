import { AddressLike, BaseContract } from "ethers";
import sinon from "sinon";
import { ContractMethodArgs, TypedContractMethod } from "../../typechain-types/common";
import { call, ContractEvmCall } from "./vote-script";
import { expect } from "chai";
import { randomAddress, randomHash } from "hardhat/internal/hardhat-network/provider/utils/random";

describe("vote script utils", () => {
  it("should create a ContractEvmCall instance with valid contract and method", () => {
    const callData = randomHash();
    sinon.stub(ContractEvmCall.prototype, "calldata").get(() => callData);
    const contractAddress = randomAddress().toString();
    const mockContract = new BaseContract(contractAddress, []);
    const mockMethod = {
      fragment: { name: "mockMethod", inputs: [] },
      staticCall: sinon.stub(),
      _contract: mockContract,
    } as unknown as TypedContractMethod;
    const args: ContractMethodArgs<any[], "view"> = [];

    const result = call(mockMethod, args);

    expect(result).to.be.instanceOf(ContractEvmCall);
    expect(result.address).to.equal(contractAddress);
    expect(result.calldata).to.equal(callData);
    sinon.restore();
  });

  it("should throw an error if method does not have _contract property", () => {
    const mockMethod = {
      fragment: { name: "mockMethod", inputs: [] },
      staticCall: sinon.stub(),
    } as unknown as TypedContractMethod;
    const args: ContractMethodArgs<any[], "view"> = [];

    expect(() => call(mockMethod, args)).to.throw("Method does not have property _contract");
  });

  it("should throw an error if _contract is not an instance of BaseContract", () => {
    const mockMethod = {
      fragment: { name: "mockMethod", inputs: [] },
      staticCall: sinon.stub(),
      _contract: {},
    } as unknown as TypedContractMethod;
    const args: ContractMethodArgs<any[], "view"> = [];

    expect(() => call(mockMethod, args)).to.throw("_contract is not an BaseContract instance");
  });

  it("should throw an error if contract.target is not a valid address", () => {
    const wrongAddress: AddressLike = {
      getAddress: async () => "invalidAddress",
    };
    const mockContract = new BaseContract(wrongAddress, []);
    const mockMethod = {
      fragment: { name: "mockMethod", inputs: [] },
      staticCall: sinon.stub(),
      _contract: mockContract,
    } as unknown as TypedContractMethod;
    const args: ContractMethodArgs<any[], "view"> = [];

    expect(() => call(mockMethod, args)).to.throw(
      "contract.target must contain valid address, but received [object Object]",
    );
  });
});
