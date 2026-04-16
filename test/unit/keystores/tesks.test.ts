import { expect } from "chai";
import hre from "hardhat";
import { getKeystores } from "../../../src/hardhat-keystores/get-keystores";

describe("keystore plugin", () => {
  it("keystore in hre", () => {
    const keystores = getKeystores(hre);
    expect(keystores).to.be.instanceOf(Object);
    expect(keystores.all).to.be.instanceOf(Function);
    expect(keystores.has).to.be.instanceOf(Function);
    expect(keystores.get).to.be.instanceOf(Function);
    expect(keystores.add).to.be.instanceOf(Function);
    expect(keystores.select).to.be.instanceOf(Function);
    expect(keystores.remove).to.be.instanceOf(Function);
    expect(keystores.unlock).to.be.instanceOf(Function);
    expect(keystores.generate).to.be.instanceOf(Function);
    expect(keystores.password).to.be.instanceOf(Function);
  });

  it("keystore in tasks", () => {
    const expectedTask = ["keystore:list", "keystore:add", "keystore:generate", "keystore:delete", "keystore:password"];
    const keystoreTasks = Object.keys(hre.tasks).filter((taskNme) => taskNme.startsWith("keystore:"));
    expect(keystoreTasks).to.deep.equal(expectedTask);
  });
});
