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
import { getRandomPrivateKey } from "@/test/depot/helpers/keystore-helpers";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("NamedKeystores.password on a real directory", () => {
  let keystoresDir: string;

  beforeEach(async () => {
    keystoresDir = await mkdtemp(join(tmpdir(), "named-keystores-fs-"));
  });

  afterEach(async () => {
    sinon.restore();
    delete NamedKeystoresStorage["instances"][keystoresDir];
    await rm(keystoresDir, { recursive: true, force: true });
  });

  it("keeps the old keystore usable when the replacement fails", async () => {
    const privateKey = getRandomPrivateKey();
    const keystores = create(NamedKeystoresStorage.create(keystoresDir));
    await keystores.add("pilot", privateKey, "pass_word");
    sinon.stub(fs, "rename").rejects(new Error("rename failed"));

    await expect(keystores.password("pilot", "new_pass_word", "pass_word")).to.be.rejectedWith("rename failed");

    sinon.restore();
    // drops the cached singleton, as a process restart would
    delete NamedKeystoresStorage["instances"][keystoresDir];
    const reloaded = create(NamedKeystoresStorage.create(keystoresDir));
    expect(await reloaded.unlock("pilot", "pass_word")).to.equal(privateKey);
  });
});

describe("NamedKeystoresStorage keystore paths on a real directory", () => {
  let rootDir: string;
  let keystoresDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "named-keystores-paths-"));
    keystoresDir = join(rootDir, "keystores");
  });

  afterEach(async () => {
    delete NamedKeystoresStorage["instances"][keystoresDir];
    await rm(rootDir, { recursive: true, force: true });
  });

  it("rejects names escaping the keystores directory on add and del", async () => {
    const victimPath = join(rootDir, "victim.json");
    await fs.writeFile(victimPath, "original");
    const storage = NamedKeystoresStorage.create(keystoresDir);
    const keystore = await NamedKeystore.fromPrivateKey("../victim", getRandomPrivateKey(), "pass_word");

    await expect(storage.add(keystore)).to.be.rejectedWith('Invalid keystore name "../victim"');
    await expect(storage.del("../victim")).to.be.rejectedWith('Invalid keystore name "../victim"');
    expect(await fs.readFile(victimPath, "utf8")).to.equal("original");
  });

  it("never overwrites an existing keystore file on add", async () => {
    await fs.mkdir(keystoresDir);
    const keystorePath = join(keystoresDir, "pilot.json");
    await fs.writeFile(keystorePath, "original");
    const storage = NamedKeystoresStorage.create(keystoresDir);
    const keystore = await NamedKeystore.fromPrivateKey("pilot", getRandomPrivateKey(), "pass_word");

    await expect(storage.add(keystore)).to.be.rejectedWith(/EEXIST/);
    expect(await fs.readFile(keystorePath, "utf8")).to.equal("original");
  });
});
