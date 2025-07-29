import { assert } from "chai";

import { buildImpls, buildInstances, buildProxies } from "./contracts";
import { ACL_ABI } from "../../abi/ACL.abi";
import { AppProxyUpgradeable_ABI } from "../../abi/AppProxyUpgradeable.abi";
import { MiniMeToken_ABI } from "../../abi/MiniMeToken.abi";
import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { CSVerifier_ABI } from "../../abi/CSVerifier.abi";

const config = {
  acl: {
    impl: { abi: ACL_ABI, address: "0x9f3b9198911054B122fDb865f8A5Ac516201c339" },
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb" },
  },
  ldo: { abi: MiniMeToken_ABI, address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32" },
  stakingModules: {
    simpleDVT: {
      impl: { abi: NodeOperatorsRegistry_ABI, address: "0x1770044a38402e3CfCa2Fcfa0C84a093c9B42135" },
      proxy: { abi: AppProxyUpgradeable_ABI, address: "0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433" },
    },
    curatedStakingModule: {
      impl: { abi: NodeOperatorsRegistry_ABI, address: "0x1770044a38402e3CfCa2Fcfa0C84a093c9B42135" },
      proxy: { abi: AppProxyUpgradeable_ABI, address: "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5" },
    },
    csVerifier: {
      abi: CSVerifier_ABI,
      address: "0x0c345dFa318f9F4977cdd4f33d80F9D0ffA38e8B",
    },
  },
} as const;

const address = "0x1234567890123456789012345678901234567890";

describe("Contracts", () => {
  it("create contracts from config", async () => {
    const impls = buildImpls(config);
    const proxies = buildProxies(config);
    const instancies = buildInstances(config);

    assert.deepEqual(Object.keys(impls), ["acl", "stakingModules"]);
    assert.deepEqual(Object.keys(proxies), ["acl", "stakingModules"]);
    assert.deepEqual(Object.keys(instancies), ["acl", "ldo", "stakingModules"]);

    assert.deepEqual(Object.keys(impls.stakingModules), ["curatedStakingModule", "simpleDVT"]);
    assert.deepEqual(Object.keys(proxies.stakingModules), ["curatedStakingModule", "simpleDVT"]);
    assert.deepEqual(Object.keys(instancies.stakingModules), ["curatedStakingModule", "simpleDVT", "csVerifier"]);

    assert.equal(instancies.ldo.target, config.ldo.impl.address);
    assert.equal(instancies.acl.target, config.acl.proxy.address);
    assert.equal(instancies.nOR.curatedStakingModule.target, config.nOR.curatedStakingModule.proxy.address);
    assert.equal(instancies.nOR.simpleDvt.target, config.nOR.simpleDvt.proxy.address);

    assert.equal(instancies.proxies.acl.target, config.acl.proxy.address);
    assert.equal(instancies.proxies.nOR.curatedStakingModule.target, config.nOR.curatedStakingModule.proxy.address);
    assert.equal(instancies.proxies.nOR.simpleDvt.target, config.nOR.simpleDvt.proxy.address);

    assert.equal(instancies.implementations.acl.target, config.acl.impl.address);
    assert.equal(
      instancies.implementations.nOR.curatedStakingModule.target,
      config.nOR.curatedStakingModule.impl.address,
    );
    assert.equal(instancies.implementations.nOR.simpleDvt.target, config.nOR.curatedStakingModule.impl.address);

    assert.isFunction(instancies.implementations.nOR.simpleDvt.activateNodeOperator);
    assert.isFunction(instancies.implementations.nOR.curatedStakingModule.activateNodeOperator);

    assert.equal(await instancies.ldo?.runner?.resolveName?.(""), "mockSigner");
    const labelLDO = contracts.label(instancies.ldo);
    const labelACL = contracts.label(instancies.acl);

    assert.include(labelACL, "Acl__Proxy");
    assert.include(labelACL, config.acl.proxy.address);

    assert.include(labelLDO, "Ldo");
    assert.include(labelLDO, config.ldo.impl.address);
  });
  it("get label form non-named contract", async () => {
    const label = contracts.label({ target: address } as any);
    assert.isTrue(label.includes("Contract"));
    assert.isTrue(label.includes(address));
  });
  it("parse string address", async () => {
    assert.equal(contracts.address(address), address);
  });
  it("parse BaseContract target address", async () => {
    assert.equal(contracts.address({ target: address } as any), address);
  });
  it("parse BaseContract target address error not a string", async () => {
    assert.throws(() => contracts.address({ target: null } as any), /target is not an string instance/);
  });
  it("parse BaseContract target address error invalid address structure", async () => {
    assert.throws(() => contracts.address({ target: "0x0" } as any), /target 0x0 is invalid bytes string/);
  });
  it("parse BaseContract target address error invalid length", async () => {
    assert.throws(() => contracts.address({ target: "0x00" } as any), /target 0x00 is invalid bytes string/);
  });
  it("parse contract address error", async () => {
    assert.throws(
      () => contracts.address({ target: "0xH234567890123456789012345678901234567890" } as any),
      /is invalid bytes string/,
    );
  });
});
