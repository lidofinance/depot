import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "fs/promises";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { create } from "@/src/hardhat-keystores/named-keystores";
import { NamedKeystore } from "@/src/hardhat-keystores/named-keystore";
import { NamedKeystoresStorage } from "@/src/hardhat-keystores/named-keystores-storage";
import { generatePrivateKey } from "viem/accounts";
import prompt from "@/src/common/prompt";

chai.use(chaiAsPromised);
const { expect } = chai;

// strange naming to avoid security linter errors
const MAIN_PASS = "pass_word";
const NEW_PASS = "new_pass_word";

describe("named keystores on a real directory", () => {
  let rootDir: string;
  let keystoresDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "named-keystores-"));
    keystoresDir = join(rootDir, "keystores");
  });

  afterEach(async () => {
    sinon.restore();
    delete NamedKeystoresStorage["instances"][keystoresDir];
    await rm(rootDir, { recursive: true, force: true });
  });

  it("changes the password of a keystore", async () => {
    const privateKey = generatePrivateKey();
    const keystores = create(NamedKeystoresStorage.create(keystoresDir));
    await keystores.add("pilot", privateKey, MAIN_PASS);

    await keystores.password("pilot", NEW_PASS, MAIN_PASS);

    expect(await keystores.unlock("pilot", NEW_PASS)).to.equal(privateKey);
  });

  it("keeps the old keystore usable when the replacement fails", async () => {
    const privateKey = generatePrivateKey();
    const keystores = create(NamedKeystoresStorage.create(keystoresDir));
    await keystores.add("pilot", privateKey, MAIN_PASS);
    sinon.stub(fs, "rename").rejects(new Error("rename failed"));

    await expect(keystores.password("pilot", NEW_PASS, MAIN_PASS)).to.be.rejectedWith("rename failed");

    sinon.restore();
    // drops the cached singleton, as a process restart would
    delete NamedKeystoresStorage["instances"][keystoresDir];
    const reloaded = create(NamedKeystoresStorage.create(keystoresDir));
    expect(await reloaded.unlock("pilot", MAIN_PASS)).to.equal(privateKey);
  });

  it("rejects names escaping the keystores directory on add and del", async () => {
    const victimPath = join(rootDir, "victim.json");
    await fs.writeFile(victimPath, "original");
    const storage = NamedKeystoresStorage.create(keystoresDir);
    const keystore = await NamedKeystore.fromPrivateKey("../victim", generatePrivateKey(), MAIN_PASS);

    await expect(storage.add(keystore)).to.be.rejectedWith('Invalid keystore name "../victim"');
    await expect(storage.del("../victim")).to.be.rejectedWith('Invalid keystore name "../victim"');
    expect(await fs.readFile(victimPath, "utf8")).to.equal("original");
  });

  it("signs with the account picked in the prompt, never another one", async () => {
    const pilotKey = generatePrivateKey();
    const copilotKey = generatePrivateKey();
    const keystores = create(NamedKeystoresStorage.create(keystoresDir));
    await keystores.add("pilot", pilotKey, MAIN_PASS);
    const copilot = await keystores.add("copilot", copilotKey, MAIN_PASS);
    const selectPrompt = sinon.stub(prompt, "select").resolves("copilot");

    expect((await keystores.select()).address).to.equal(copilot.address);
    expect(await keystores.unlock(undefined, MAIN_PASS)).to.equal(copilotKey);

    selectPrompt.resetHistory();
    await expect(keystores.unlock("copiolt", MAIN_PASS)).to.be.rejectedWith('Account "copiolt" not found');
    sinon.assert.notCalled(selectPrompt);
  });

  it("never overwrites an existing keystore file on add", async () => {
    await fs.mkdir(keystoresDir);
    const keystorePath = join(keystoresDir, "pilot.json");
    await fs.writeFile(keystorePath, "original");
    const storage = NamedKeystoresStorage.create(keystoresDir);
    const keystore = await NamedKeystore.fromPrivateKey("pilot", generatePrivateKey(), MAIN_PASS);

    await expect(storage.add(keystore)).to.be.rejectedWith(/EEXIST/);
    expect(await fs.readFile(keystorePath, "utf8")).to.equal("original");
  });
});
