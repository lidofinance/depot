import { assert } from "chai";
import * as factories from "../../typechain-types";
import { NamedContractsBuilder } from "./named-contract";

const config = {
  acl: {
    impl: {
      factory: factories.ACL__factory,
      address: "0x9f3b9198911054B122fDb865f8A5Ac516201c339",
    },
    proxy: {
      factory: factories.AppProxyUpgradeable__factory,
      address: "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb",
    },
  },
  ldo: {
    impl: {
      factory: factories.MiniMeToken__factory,
      address: "0x14ae7daeecdf57034f3E9db8564e46Dba8D97344",
    },
    proxy: null,
  },
} as const;

describe("Named Contracts", () => {
  it("check proxy contract", async () => {
    assert.isTrue(NamedContractsBuilder.isProxy(config.acl));
  });
  it("check not-proxy contract", async () => {
    assert.isFalse(NamedContractsBuilder.isProxy(config.ldo));
  });
});
