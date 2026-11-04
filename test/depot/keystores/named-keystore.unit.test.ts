import { expect } from "chai";
import { NamedKeystore } from "@/src/hardhat-keystores/named-keystore";
import { encrypt } from "web3-eth-accounts";
import { getRandomPrivateKey } from "../helpers/keystore-helpers";

describe("NamedKeystore", () => {
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
});
