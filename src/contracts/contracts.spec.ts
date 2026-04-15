import { assert } from "chai";
import sinon from "sinon";
import { ACL_ABI } from "../../abi/ACL.abi";
import { AppProxyUpgradeable_ABI } from "../../abi/AppProxyUpgradeable.abi";
import { MiniMeToken_ABI } from "../../abi/MiniMeToken.abi";
import { Voting_ABI } from "../../abi/Voting.abi";
import { ContractInfoResolver } from "../contract-info-resolver/contract-info-resolver";
import {
  buildImpls,
  buildInstances,
  buildProxies,
  contract,
  getEventAbi,
  getFunctionAbi,
  getLidoContracts,
  resolveContract,
} from "./contracts";

const config = {
  acl: {
    impl: { abi: ACL_ABI, address: "0x9f3b9198911054B122fDb865f8A5Ac516201c339" },
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb" },
  },
  ldo: { abi: MiniMeToken_ABI, address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32" },
  voting: {
    impl: { abi: Voting_ABI, address: "0xf165148978fa3ce74d76043f833463c340cfb704" },
    proxy: { abi: AppProxyUpgradeable_ABI, address: "0x2e59A20f205bB85a89C53f1936454680651E618e" },
  },
} as const;

describe("contracts", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("builds instances/proxies/impls from config", () => {
    const impls = buildImpls(config);
    const proxies = buildProxies(config);
    const instances = buildInstances(config);

    assert.deepEqual(Object.keys(impls), ["acl", "voting"]);
    assert.deepEqual(Object.keys(proxies), ["acl", "voting"]);
    assert.deepEqual(Object.keys(instances), ["acl", "ldo", "voting"]);

    assert.equal(instances.ldo.label, "Ldo");
    assert.equal(instances.acl.label, "Acl__Proxy");
    assert.equal(instances.voting.label, "Voting__Proxy");
    assert.equal(proxies.acl.label, "Acl__Proxy");
    assert.equal(impls.acl.label, "Acl__Impl");

    // instances use proxy address for proxied contracts, own address for plain contracts
    assert.equal(instances.acl.address, config.acl.proxy.address.toLowerCase());
    assert.equal(instances.ldo.address, config.ldo.address.toLowerCase());
    // impls use impl address
    assert.equal(impls.acl.address, config.acl.impl.address.toLowerCase());
  });

  it("builds nested contract groups", () => {
    const nestedConfig = {
      ...config,
      stakingModules: {
        simpleDVT: {
          impl: { abi: ACL_ABI, address: "0x1770044a38402e3CfCa2Fcfa0C84a093c9B42135" },
          proxy: { abi: AppProxyUpgradeable_ABI, address: "0xaE7B191A31f627b4eB1d4DaC64eaB9976995b433" },
        },
      },
    } as const;

    const instances = buildInstances(nestedConfig);
    const proxies = buildProxies(nestedConfig);
    const impls = buildImpls(nestedConfig);

    assert.containsAllKeys(instances, ["acl", "ldo", "voting", "stakingModules"]);
    assert.equal((instances as any).stakingModules.simpleDVT.label, "SimpleDVT__Proxy");
    assert.equal((proxies as any).stakingModules.simpleDVT.label, "SimpleDVT__Proxy");
    assert.equal((impls as any).stakingModules.simpleDVT.label, "SimpleDVT__Impl");
  });

  it("creates explicit contract object", () => {
    const c = contract(MiniMeToken_ABI, "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", "LDO");
    assert.equal(c.label, "LDO");
    assert.equal(c.address, "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32");
  });

  it("extracts abi function and event", () => {
    const voting = buildInstances(config).voting;
    const fn = getFunctionAbi(voting, "newVote");
    const event = getEventAbi(voting, "StartVote");

    assert.equal(fn.type, "function");
    assert.equal(fn.name, "newVote");
    assert.equal(event.type, "event");
    assert.equal(event.name, "StartVote");
  });

  it("returns known lido contracts for mainnet", () => {
    const contracts = getLidoContracts("mainnet");
    assert.containsAllKeys(contracts, ["ldo", "voting", "tokenManager"]);
    assert.match(contracts.ldo.address, /^0x[0-9a-f]{40}$/);
    assert.equal(contracts.voting.label, "Voting__Proxy");
  });

  it("resolves known local contract without etherscan", async () => {
    const contracts = getLidoContracts("mainnet");
    const res = await resolveContract("mainnet", contracts.ldo.address);

    assert.isAtLeast(res.length, 1);
    assert.equal(res[0].address, contracts.ldo.address);
    assert.equal(res[0].label, contracts.ldo.label);
  });

  it("resolves unknown non-proxy contract through etherscan", async () => {
    const unknown = "0x1111111111111111111111111111111111111111";
    sinon.stub(ContractInfoResolver, "resolve").resolves({
      name: "unknownContract",
      abi: [],
      implementation: null,
      constructorArgs: "0x",
      sourceCode: "",
      evmVersion: "default",
      compilerVersion: "0.8.0",
    } as any);

    const res = await resolveContract("mainnet", unknown);

    assert.deepEqual(res, [{ address: unknown, abi: [], label: "UnknownContract" }]);
  });

  it("resolves unknown proxy contract with implementation", async () => {
    const proxy = "0x2222222222222222222222222222222222222222";
    const impl = "0x3333333333333333333333333333333333333333";
    sinon
      .stub(ContractInfoResolver, "resolve")
      .onFirstCall()
      .resolves({
        name: "proxyContract",
        abi: [{ type: "function", name: "foo", inputs: [], outputs: [], stateMutability: "view" }],
        implementation: impl,
        constructorArgs: "0x",
        sourceCode: "",
        evmVersion: "default",
        compilerVersion: "0.8.0",
      } as any)
      .onSecondCall()
      .resolves({
        name: "implContract",
        abi: [{ type: "function", name: "bar", inputs: [], outputs: [], stateMutability: "view" }],
        implementation: null,
        constructorArgs: "0x",
        sourceCode: "",
        evmVersion: "default",
        compilerVersion: "0.8.0",
      } as any);

    const res = await resolveContract("mainnet", proxy);

    assert.lengthOf(res, 2);
    assert.equal(res[0].address, proxy);
    assert.equal(res[1].address, proxy);
    assert.equal(res[0].label, "ImplContract__Proxy");
    assert.equal(res[1].label, "ImplContract__Proxy");
  });
});
