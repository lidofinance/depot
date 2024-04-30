import { expect } from "chai";
import { NamedKeystoresStorage } from "./named-keystores-storage";
import { NamedKeystore } from "./named-keystore";
import fs from "fs/promises";
import path from "path";
import sinon from "sinon";
import { create, encrypt } from "web3-eth-accounts";
import { KeyStore } from "web3-types";

describe("NamedKeystoresStorage", () => {
  const keystoresDir = "./keystores";
  let writeFileStub: sinon.SinonStub;
  let unlinkStub: sinon.SinonStub;
  let readFileStub: sinon.SinonStub;
  let accessStub: sinon.SinonStub;
  let mkdirStub: sinon.SinonStub;
  let storage: NamedKeystoresStorage;
  let ks: KeyStore;

  before(async () => {
    ks = await encrypt(create().privateKey, "password");
  });

  beforeEach(async () => {
    storage = NamedKeystoresStorage.create(keystoresDir);
    storage["accounts"] = [];
    writeFileStub = sinon.stub(fs, "writeFile");
    unlinkStub = sinon.stub(fs, "unlink");
    readFileStub = sinon.stub(fs, "readFile");
    accessStub = sinon.stub(fs, "access");
    mkdirStub = sinon.stub(fs, "mkdir");
  });

  afterEach(() => {
    writeFileStub.restore();
    unlinkStub.restore();
    readFileStub.restore();
    accessStub.restore();
    mkdirStub.restore();
  });

  it("creates a new instance if one does not exist", () => {
    expect(storage).to.be.instanceOf(NamedKeystoresStorage);
  });

  it("returns an existing instance if one exists", () => {
    const secondStorage = NamedKeystoresStorage.create(keystoresDir);

    expect(secondStorage).to.equal(storage);
  });

  it("adds a new keystore and writes it to the filesystem", async () => {
    const keystore = new NamedKeystore("test", ks);

    await storage.add(keystore);

    sinon.assert.calledWith(writeFileStub, path.join(keystoresDir, "test.json"), keystore.toJson());
  });

  it("gets a keystore by name", async () => {
    const keystore = new NamedKeystore("test", ks);
    await storage.add(keystore);

    const retrievedKeystore = await storage.get("test");

    expect(retrievedKeystore).to.deep.equal(keystore);
  });

  it("load accounts from filesystem if storage is empty on get call", async () => {
    storage["accounts"] = [];
    const loadAccountsStub: sinon.SinonStub = sinon.stub(storage, "loadAccounts" as any);
    loadAccountsStub.resolves([]);

    const retrievedKeystore = await storage.get("test");

    expect(retrievedKeystore).to.deep.equal(null);
    sinon.assert.calledOnce(loadAccountsStub);
    loadAccountsStub.restore();
  });

  it("load accounts from filesystem if storage is empty on all call", async () => {
    storage["accounts"] = [];
    const loadAccountsStub: sinon.SinonStub = sinon.stub(storage, "loadAccounts" as any);
    loadAccountsStub.resolves([]);

    const retrievedKeystore = await storage.all();

    expect(retrievedKeystore).to.deep.equal([]);
    sinon.assert.calledOnce(loadAccountsStub);
    loadAccountsStub.restore();
  });

  it("returns null if a keystore does not exist", async () => {
    const readdirStub: sinon.SinonStub = sinon.stub(fs, "readdir");
    readdirStub.resolves([]);

    const retrievedKeystore = await storage.get("nonexistent");

    expect(retrievedKeystore).to.be.null;
    sinon.assert.calledWith(readdirStub, keystoresDir);
    readdirStub.restore();
  });

  it("deletes a keystore by name", async () => {
    const readdirStub: sinon.SinonStub = sinon.stub(fs, "readdir");
    readdirStub.resolves([]);
    const keystore = new NamedKeystore("test", ks);
    await storage.add(keystore);

    await storage.del("test");

    sinon.assert.calledWith(unlinkStub, path.join(keystoresDir, "test.json"));
    readdirStub.restore();
  });

  it("returns all keystores", async () => {
    const keystore1 = new NamedKeystore("test1", ks);
    const keystore2 = new NamedKeystore("test2", ks);
    await storage.add(keystore1);
    await storage.add(keystore2);

    const allKeystores = await storage.all();

    expect(allKeystores).to.deep.equal([keystore1, keystore2]);
  });

  it("reads a file from the filesystem", async () => {
    const fileName = "test.json";
    const fileContent = JSON.stringify(new NamedKeystore("test", ks));
    readFileStub.resolves(fileContent);

    const result = await storage["read"](fileName);

    expect(result).to.equal(fileContent);
    sinon.assert.calledWith(readFileStub, path.join(keystoresDir, fileName), "utf8");
  });

  it("throws an error if the file does not exist", async () => {
    const fileName = "nonexistent.json";
    readFileStub.rejects(new Error("File not found"));

    try {
      await storage["read"](fileName);
    } catch (err: any) {
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.equal("File not found");
    }

    sinon.assert.calledWith(readFileStub, path.join(keystoresDir, fileName), "utf8");
  });

  it("does not create directory if it already exists", async () => {
    accessStub.resolves();

    await storage["checkKeystoresDir"]();

    sinon.assert.calledWith(accessStub, keystoresDir);
    sinon.assert.notCalled(mkdirStub);
  });

  it("creates directory if it does not exist", async () => {
    accessStub.rejects(new Error("Directory not found"));
    mkdirStub.resolves();

    await storage["checkKeystoresDir"]();

    sinon.assert.calledWith(accessStub, keystoresDir);
    sinon.assert.calledWith(mkdirStub, keystoresDir, { recursive: true });
  });

  it("loads all accounts from the filesystem", async () => {
    const readdirStub: sinon.SinonStub = sinon.stub(fs, "readdir");
    const readStub: sinon.SinonStub = sinon.stub(storage, "read" as any);
    const fileNames = ["test1.json", "test2.json"];
    const keystores = [new NamedKeystore("test1", ks), new NamedKeystore("test2", ks)];
    readdirStub.resolves(fileNames);
    readStub.onFirstCall().resolves(JSON.stringify(keystores[0]));
    readStub.onSecondCall().resolves(JSON.stringify(keystores[1]));

    const result = await storage.loadAccounts();

    expect(result).to.deep.equal(keystores);
    sinon.assert.calledWith(readdirStub, keystoresDir);
    sinon.assert.calledWith(readStub.firstCall, fileNames[0]);
    sinon.assert.calledWith(readStub.secondCall, fileNames[1]);
    readdirStub.restore();
    readStub.restore();
  });

  it("returns an empty array if no accounts exist", async () => {
    const readdirStub: sinon.SinonStub = sinon.stub(fs, "readdir");
    const readStub: sinon.SinonStub = sinon.stub(storage, "read" as any);
    readdirStub.resolves([]);

    const result = await storage["loadAccounts"]();

    expect(result).to.deep.equal([]);
    sinon.assert.calledWith(readdirStub, keystoresDir);
    readdirStub.restore();
    readStub.restore();
  });
});
