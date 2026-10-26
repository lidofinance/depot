import { expect } from "chai";
import * as env from "../../src/common/env";

describe("environment helpers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns ETH_LOCAL_RPC_PORT with fallback", () => {
    delete process.env.ETH_LOCAL_RPC_PORT;
    expect(env.ETH_LOCAL_RPC_PORT()).to.equal("8545");

    process.env.ETH_LOCAL_RPC_PORT = "19545";
    expect(env.ETH_LOCAL_RPC_PORT()).to.equal("19545");
  });

  it("returns required RPC urls", () => {
    process.env.ETH_MAINNET_RPC_URL = "https://mainnet.example/rpc";
    process.env.ETH_HOLESKY_RPC_URL = "https://holesky.example/rpc";
    process.env.ETH_HOODI_RPC_URL = "https://hoodi.example/rpc";

    expect(env.ETH_MAINNET_RPC_URL()).to.equal("https://mainnet.example/rpc");
    expect(env.ETH_HOLESKY_RPC_URL()).to.equal("https://holesky.example/rpc");
    expect(env.ETH_HOODI_RPC_URL()).to.equal("https://hoodi.example/rpc");
  });

  it("throws on missing required env var", () => {
    delete process.env.MISSING_VAR;
    expect(() => env.getRequiredEnvVar("MISSING_VAR")).to.throw('required ENV variable "MISSING_VAR" is not set');
  });

  it("returns optional var or default", () => {
    delete process.env.OPTIONAL_VAR;
    expect(env.getOptionalEnvVar("OPTIONAL_VAR", "fallback")).to.equal("fallback");

    process.env.OPTIONAL_VAR = "value";
    expect(env.getOptionalEnvVar("OPTIONAL_VAR", "fallback")).to.equal("value");
  });

  it("returns raw optional tokens", () => {
    process.env.ETHERSCAN_TOKEN = "etherscan-token";
    process.env.PINATA_JWT = "pinata-jwt";

    expect(env.ETHERSCAN_TOKEN()).to.equal("etherscan-token");
    expect(env.PINATA_JWT()).to.equal("pinata-jwt");
  });

  it("returns branch and org defaults", () => {
    delete process.env.GITHUB_ORG;
    delete process.env.GIT_BRANCH_SCRIPTS;
    delete process.env.GIT_BRANCH_DG;
    delete process.env.GIT_BRANCH_CORE;
    delete process.env.GIT_BRANCH_STAKING_MODULES;
    delete process.env.GIT_BRANCH_STONKS;

    expect(env.GITHUB_ORG()).to.equal("lidofinance");
    expect(env.GIT_BRANCH_SCRIPTS()).to.equal("master");
    expect(env.GIT_BRANCH_DG()).to.equal("main");
    expect(env.GIT_BRANCH_CORE()).to.equal("master");
    expect(env.GIT_BRANCH_STAKING_MODULES()).to.equal("develop");
    expect(env.GIT_BRANCH_STONKS()).to.equal("main");

    process.env.GIT_BRANCH_STAKING_MODULES = "release-candidate";
    process.env.GIT_BRANCH_STONKS = "release-candidate";
    expect(env.GIT_BRANCH_STAKING_MODULES()).to.equal("release-candidate");
    expect(env.GIT_BRANCH_STONKS()).to.equal("release-candidate");
  });

  it("returns SHA defaults and overrides", () => {
    delete process.env.GIT_SHA_SCRIPTS;
    delete process.env.GIT_SHA_DG;
    delete process.env.GIT_SHA_CORE;
    delete process.env.GIT_SHA_STAKING_MODULES;
    delete process.env.GIT_SHA_STONKS;

    expect(env.GIT_SHA_SCRIPTS()).to.equal("");
    expect(env.GIT_SHA_DG()).to.equal("");
    expect(env.GIT_SHA_CORE()).to.equal("");
    expect(env.GIT_SHA_STAKING_MODULES()).to.equal("");
    expect(env.GIT_SHA_STONKS()).to.equal("");

    process.env.GIT_SHA_SCRIPTS = "sha1";
    process.env.GIT_SHA_DG = "sha2";
    process.env.GIT_SHA_CORE = "sha3";
    process.env.GIT_SHA_STAKING_MODULES = "sha4";
    process.env.GIT_SHA_STONKS = "sha5";
    expect(env.GIT_SHA_SCRIPTS()).to.equal("sha1");
    expect(env.GIT_SHA_DG()).to.equal("sha2");
    expect(env.GIT_SHA_CORE()).to.equal("sha3");
    expect(env.GIT_SHA_STAKING_MODULES()).to.equal("sha4");
    expect(env.GIT_SHA_STONKS()).to.equal("sha5");
  });

  it("returns default HH node image", () => {
    delete process.env.HH_NODE_IMAGE;
    expect(env.HH_NODE_IMAGE()).to.equal("ghcr.io/lidofinance/hardhat-node:2.26.0");

    process.env.HH_NODE_IMAGE = "custom-node";
    expect(env.HH_NODE_IMAGE()).to.equal("custom-node");
  });
});
