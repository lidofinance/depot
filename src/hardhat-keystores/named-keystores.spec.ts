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

  beforeEach(async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "named-keystores-"));
    storage = await NamedKeystoresStorage.create(tmpDir);
    namedKeystores = create(storage);
    selectStub = sinon.stub(prompt, "select");
  });

  afterEach(async () => {
    const accounts = await storage.all();
    await Promise.all(accounts.map((acc) => storage.del(acc.name)));
    selectStub.restore();
  });

  it("adds a new keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const password = "password";

    const keystore = await namedKeystores.add(name, privateKey, password);

    expect(keystore).to.be.instanceOf(NamedKeystore);
    expect(await namedKeystores.has(name)).to.be.true;
  });

  it("generates a new keystore", async () => {
    const name = "test";
    const password = "password";

    const keystore = await namedKeystores.generate(name, password);

    expect(keystore).to.be.instanceOf(NamedKeystore);
    expect(await namedKeystores.has(name)).to.be.true;
  });

  it("throws an error when generating a keystore with an existing name", async () => {
    const name = "test";
    const password = "password";

    await namedKeystores.generate(name, password);

    await expect(namedKeystores.generate(name, password)).to.be.rejectedWith(AccountAlreadyExistsError);
  });

  it("throws an error when adding a keystore with an existing name", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const password = "password";

    await namedKeystores.add(name, privateKey, password);

    await expect(namedKeystores.add(name, privateKey, password)).to.be.rejectedWith(AccountAlreadyExistsError);
  });

  it("removes a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const password = "password";
    await namedKeystores.add(name, privateKey, password);

    await namedKeystores.remove(name);

    expect(await namedKeystores.has(name)).to.be.false;
  });

  it("unlocks a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const password = "password";

    await namedKeystores.add(name, privateKey, password);
    const unlockedPrivateKey = await namedKeystores.unlock(name, password);

    expect(unlockedPrivateKey).to.equal(privateKey);
  });

  it("throws an error when unlocking empty keystores", async () => {
    const name = "test";
    const password = "password";

    await expect(namedKeystores.unlock(name, password)).to.be.rejectedWith(NoKeystoreError);
  });

  it("changes the password of a keystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const oldPassword = "password";
    const newPassword = "newPassword";

    await namedKeystores.add(name, privateKey, oldPassword);
    await namedKeystores.password(name, newPassword, oldPassword);

    const unlockedPrivateKey = await namedKeystores.unlock(name, newPassword);
    expect(unlockedPrivateKey).to.equal(privateKey);
  });

  it("selects a keystore if name isn't provided", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const oldPassword = "password";
    const newPassword = "newPassword";
    await namedKeystores.add(name, privateKey, oldPassword);
    await namedKeystores.password(name, newPassword, oldPassword);
    selectStub.resolves(name);

    const unlockedPrivateKey = await namedKeystores.unlock(undefined, newPassword);
    expect(unlockedPrivateKey).to.equal(privateKey);
  });

  it("selects a keystore when multiple exist", async () => {
    const name1 = "test1";
    const privateKey1 = getRandomPrivateKey();
    const password1 = "password1";
    const name2 = "test2";
    const privateKey2 = getRandomPrivateKey();
    const password2 = "password2";
    await namedKeystores.add(name1, privateKey1, password1);
    await namedKeystores.add(name2, privateKey2, password2);
    selectStub.resolves(name1);

    const selectedKeystore = await namedKeystores.select();

    expect(selectedKeystore).to.be.instanceOf(NamedKeystore);
    expect(selectedKeystore.name).to.equal(name1);
  });

  it("throws an error when no keystores exist", async () => {
    await expect(namedKeystores.select()).to.be.rejectedWith(NoKeystoreError);
  });
});
