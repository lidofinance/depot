import { expect } from "chai";
import * as env from "./env";
import sinon from "sinon";

describe("Environment variable functions", () => {
  it("returns the value of LOCAL_ETH_RPC_PORT", () => {
    process.env.LOCAL_ETH_RPC_PORT = "9545";
    expect(env.LOCAL_ETH_RPC_PORT()).to.equal("9545");
  });

  it("returns the value of LOCAL_ARB_RPC_PORT", () => {
    process.env.LOCAL_ARB_RPC_PORT = "9546";
    expect(env.LOCAL_ARB_RPC_PORT()).to.equal("9546");
  });

  it("returns the value of LOCAL_OPT_RPC_PORT", () => {
    process.env.LOCAL_OPT_RPC_PORT = "9547";
    expect(env.LOCAL_OPT_RPC_PORT()).to.equal("9547");
  });

  it("returns the value of ETH_RPC_URL", () => {
    process.env.ETH_RPC_URL = "https://mainnet.infura.io/v3/YOUR-PROJECT-ID";
    expect(env.ETH_RPC_URL()).to.equal("https://mainnet.infura.io/v3/YOUR-PROJECT-ID");
  });

  it("returns the value of ARB_RPC_URL", () => {
    process.env.ARB_RPC_URL = "https://arb1.arbitrum.io/rpc";
    expect(env.ARB_RPC_URL()).to.equal("https://arb1.arbitrum.io/rpc");
  });

  it("returns the value of OPT_RPC_URL", () => {
    process.env.OPT_RPC_URL = "https://mainnet.optimism.io";
    expect(env.OPT_RPC_URL()).to.equal("https://mainnet.optimism.io");
  });

  it("returns the value of INFURA_TOKEN", () => {
    process.env.INFURA_TOKEN = "your-infura-token";
    expect(env.INFURA_TOKEN()).to.equal("your-infura-token");
  });

  it("returns the value of ALCHEMY_TOKEN", () => {
    process.env.ALCHEMY_TOKEN = "your-alchemy-token";
    expect(env.ALCHEMY_TOKEN()).to.equal("your-alchemy-token");
  });

  it("returns the value of ETHERSCAN_TOKEN", () => {
    process.env.ETHERSCAN_TOKEN = "your-etherscan-token";
    expect(env.ETHERSCAN_TOKEN()).to.equal("your-etherscan-token");
  });

  it("logs a warning if ETHERSCAN_TOKEN is not set", () => {
    const consoleWarnStub = sinon.stub(console, "warn");
    delete process.env.ETHERSCAN_TOKEN;

    env.checkEnvVars();

    expect(consoleWarnStub.calledWithMatch(/ETHERSCAN_TOKEN is not set/)).to.be.true;
    consoleWarnStub.restore();
  });

  it("returns true if ETHERSCAN_CACHE_ENABLED is set to true", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "true";
    expect(env.ETHERSCAN_CACHE_ENABLED()).to.be.true;
  });

  it("returns true if ETHERSCAN_CACHE_ENABLED is set to 1", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "1";
    expect(env.ETHERSCAN_CACHE_ENABLED()).to.be.true;
  });

  it("returns true if ETHERSCAN_CACHE_ENABLED is set to yes", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "yes";
    expect(env.ETHERSCAN_CACHE_ENABLED()).to.be.true;
  });

  it("returns false if ETHERSCAN_CACHE_ENABLED is set to false", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "false";
    expect(env.ETHERSCAN_CACHE_ENABLED()).to.be.false;
  });

  it("returns false if ETHERSCAN_CACHE_ENABLED is set to 0", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "0";
    expect(env.ETHERSCAN_CACHE_ENABLED()).to.be.false;
  });

  it("returns false if ETHERSCAN_CACHE_ENABLED is set to no", () => {
    process.env.ETHERSCAN_CACHE_ENABLED = "no";
    expect(env.ETHERSCAN_CACHE_ENABLED()).to.be.false;
  });

  it("returns false if ETHERSCAN_CACHE_ENABLED is not set", () => {
    delete process.env.ETHERSCAN_CACHE_ENABLED;
    expect(env.ETHERSCAN_CACHE_ENABLED()).to.be.false;
  });
});
