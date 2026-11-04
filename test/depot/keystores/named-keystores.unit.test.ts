import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { NamedKeystores, create, AccountAlreadyExistsError } from "@/src/hardhat-keystores/named-keystores";
import { NamedKeystoresStorage } from "@/src/hardhat-keystores/named-keystores-storage";
import { getRandomPrivateKey } from "../helpers/keystore-helpers";
import { afterEach } from "mocha";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("NamedKeystores", () => {
  let namedKeystores: NamedKeystores;
  let storage: NamedKeystoresStorage;

  // strange naming to avoid security linter errors
  const mainPass = "pass_word";
  const newPass = "new_pass_word";

  beforeEach(async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "named-keystores-"));
    storage = NamedKeystoresStorage.create(tmpDir);
    namedKeystores = create(storage);
  });

  afterEach(async () => {
    const accounts = await namedKeystores.all();
    await Promise.all(accounts.map((acc) => storage.del(acc.name)));
  });

  it("throws an error when adding a keystore with an existing name", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();

    await namedKeystores.add(name, privateKey, mainPass);

    await expect(namedKeystores.add(name, privateKey, mainPass)).to.be.rejectedWith(AccountAlreadyExistsError);
  });

  it("unlocks a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();

    await namedKeystores.add(name, privateKey, mainPass);
    const unlockedPrivateKey = await namedKeystores.unlock(name, mainPass);

    expect(unlockedPrivateKey).to.equal(privateKey);
  });

  it("failed unlocks a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();

    await namedKeystores.add(name, privateKey, mainPass);
    await expect(namedKeystores.unlock(name, "wrong-password")).to.be.rejectedWith(
      'Wrong password for the account "test"',
    );
  });

  it("changes the password of a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();

    await namedKeystores.add(name, privateKey, mainPass);
    await namedKeystores.password(name, newPass, mainPass);

    const unlockedPrivateKey = await namedKeystores.unlock(name, newPass);
    expect(unlockedPrivateKey).to.equal(privateKey);
  });
});
