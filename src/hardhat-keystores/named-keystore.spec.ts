import { expect } from "chai";
import { NamedKeystore } from "./named-keystore";
import { encrypt } from "web3-eth-accounts";
import { PrivateKey } from "../common/types";
import { getRandomPrivateKey } from "./test_helpers";
import bytes from "../common/bytes";

describe("NamedKeystore", () => {
  it("creates a NamedKeystore from a private key", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const password = "password";
    const ks = await encrypt(privateKey, password);

    const namedKeystore = await NamedKeystore.fromPrivateKey(name, privateKey, password);

    expect(namedKeystore).to.be.instanceOf(NamedKeystore);
    expect(namedKeystore.name).to.equal(name);
    expect(namedKeystore.address).to.equal(bytes.normalize(ks.address));
  });

  it("generates a NamedKeystore", async () => {
    const name = "test";
    const password = "password";

    const namedKeystore = await NamedKeystore.generate(name, password);

    expect(namedKeystore).to.be.instanceOf(NamedKeystore);
  });

  it("decrypts the NamedKeystore", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const keystore = await encrypt(privateKey, "password");
    const password = "password";
    const namedKeystore = new NamedKeystore(name, keystore);

    const decryptedPrivateKey = await namedKeystore.decrypt(password);

    expect(decryptedPrivateKey).to.equal(privateKey);
  });

  it("converts NamedKeystore to JSON excluding name", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const keystore = await encrypt(privateKey, "password");
    const namedKeystore = new NamedKeystore(name, keystore);

    const json = namedKeystore.toJson();

    const parsedJson = JSON.parse(json);
    expect(parsedJson).to.have.property("id");
    expect(parsedJson).to.have.property("address");
    expect(parsedJson).to.have.property("crypto");
    expect(parsedJson).to.not.have.property("name");
  });

  it("throws an error for an empty name", async () => {
    const name = "";
    const privateKey = getRandomPrivateKey();
    const password = "password";

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, password)).to.be.rejectedWith("Name is empty");
  });

  it("throws an error for an invalid private key", async () => {
    const name = "test";
    const privateKey = "0xinvalid";
    const password = "password";

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, password)).to.be.rejectedWith(
      "Private key is not a valid hex string",
    );
  });

  it("throws an error for private key with a wrong length", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey().slice(2, -2) as PrivateKey;
    const password = "password";

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, password)).to.be.rejectedWith(
      "Invalid private key length",
    );
  });

  it("throws an error for an empty password", async () => {
    const name = "test";
    const privateKey = getRandomPrivateKey();
    const password = "";

    await expect(NamedKeystore.fromPrivateKey(name, privateKey, password)).to.be.rejectedWith("Password is empty");
  });
});
