import { expect } from "chai";
import hre from "hardhat";
import { getKeystores } from "../../src/hardhat-keystores/get-keystores";

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

  it("keystore tasks registered in hre", () => {
    const expectedTasks = ["keystore:list", "keystore:add", "keystore:generate", "keystore:delete", "keystore:password"];
    for (const taskName of expectedTasks) {
      expect(() => hre.tasks.getTask(taskName), `task ${taskName} should be registered`).to.not.throw();
    }
  });
});
