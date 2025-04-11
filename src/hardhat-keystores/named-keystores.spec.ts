import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { NamedKeystores, create, AccountAlreadyExistsError, NoKeystoreError } from "./named-keystores";
import { NamedKeystore } from "./named-keystore";
import { NamedKeystoresStorage } from "./named-keystores-storage";
import { getRandomPrivateKey } from "./test_helpers";
import { afterEach } from "mocha";
import sinon from "sinon";
import prompt from "../common/prompt";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("NamedKeystores", () => {
  let namedKeystores: NamedKeystores;
  let storage: NamedKeystoresStorage;
  let selectStub: sinon.SinonStub;

  // strange naming to avoid security linter errors
  const mainPass = "pass_word";
  const newPass = "new_pass_word";

  beforeEach(async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "named-keystores-"));
    storage = NamedKeystoresStorage.create(tmpDir);
    namedKeystores = create(storage);
    selectStub = sinon.stub(prompt, "select");
  });

  afterEach(async () => {
    const accounts = await namedKeystores.all();
    await Promise.all(accounts.map((acc) => storage.del(acc.name)));
    selectStub.restore();
  });

  it("adds a new keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();

    const keystore = await namedKeystores.add(name, privateKey, mainPass);

    expect(keystore).to.be.instanceOf(NamedKeystore);
    expect(await namedKeystores.has(name)).to.be.true;
  });

  it("adds a new invalid keystore", async () => {
    const name = "test";
    const privateKey = "invalid keystore";

    await expect(namedKeystores.add(name, privateKey, mainPass)).to.be.rejectedWith(
      "Private key value is invalid hex string",
    );
  });

  it("generates a new keystore", async () => {
    const name = "test";

    const keystore = await namedKeystores.generate(name, mainPass);

    expect(keystore).to.be.instanceOf(NamedKeystore);
    expect(await namedKeystores.has(name)).to.be.true;
  });

  it("throws an error when generating a keystore with an existing name", async () => {
    const name = "test";

    await namedKeystores.generate(name, mainPass);

    await expect(namedKeystores.generate(name, mainPass)).to.be.rejectedWith(AccountAlreadyExistsError);
  });

  it("throws an error when adding a keystore with an existing name", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();

    await namedKeystores.add(name, privateKey, mainPass);

    await expect(namedKeystores.add(name, privateKey, mainPass)).to.be.rejectedWith(AccountAlreadyExistsError);
  });

  it("removes a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    await namedKeystores.add(name, privateKey, mainPass);

    await namedKeystores.remove(name);

    expect(await namedKeystores.has(name)).to.be.false;
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
      "Key derivation failed - possibly wrong password",
    );
  });

  it("throws an error when unlocking empty keystores", async () => {
    const name = "test";

    await expect(namedKeystores.unlock(name, mainPass)).to.be.rejectedWith(NoKeystoreError);
  });

  it("changes the password of a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();

    await namedKeystores.add(name, privateKey, mainPass);
    await namedKeystores.password(name, newPass, mainPass);

    const unlockedPrivateKey = await namedKeystores.unlock(name, newPass);
    expect(unlockedPrivateKey).to.equal(privateKey);
  });

  it("selects a keystore if name isn't provided", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    await namedKeystores.add(name, privateKey, mainPass);
    await namedKeystores.password(name, newPass, mainPass);
    selectStub.resolves(name);

    const unlockedPrivateKey = await namedKeystores.unlock(undefined, newPass);
    expect(unlockedPrivateKey).to.equal(privateKey);
  });

  it("selects a keystore when multiple exist", async () => {
    const name1 = "test1";
    const privateKey1 = getRandomPrivateKey();
    const name2 = "test2";
    const privateKey2 = getRandomPrivateKey();
    await namedKeystores.add(name1, privateKey1, mainPass);
    await namedKeystores.add(name2, privateKey2, newPass);
    selectStub.resolves(name1);

    const selectedKeystore = await namedKeystores.select();

    expect(selectedKeystore).to.be.instanceOf(NamedKeystore);
    expect(selectedKeystore.name).to.equal(name1);
  });

  it("throws an error when no keystores exist", async () => {
    await expect(namedKeystores.select()).to.be.rejectedWith(NoKeystoreError);
  });
});
