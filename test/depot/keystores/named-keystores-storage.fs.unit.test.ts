import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "fs/promises";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import { create } from "@/src/hardhat-keystores/named-keystores";
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
