import { assert } from "chai";
import type { Context } from "mocha";
import { OssifiableProxy_ABI } from "../../../abi/OssifiableProxy.abi";
import { contract } from "../../../src/contracts";
import { createDevRpcClient, DevRpcClient } from "../../../src/network";
import { getGovernanceContracts } from "../../../src/omnibuses/governance-contracts";

// Core deployment configuration: https://github.com/lidofinance/core/tree/2bd532298d85cdf520169fdc0c5fb0cc9baf03c3
const configurations = {
  mainnet: {
    implementation: "0x60E09F1791F1168d0450E4F100616B4a3F95119C",
    admin: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    accountingOracle: "0x852deD011285fe67063a08005c71a85690503Cee",
    depositSecurityModule: "0x39BB5d491e98A44D1bfe8047A737a81E296a63E0",
    elRewardsVault: "0x388C818CA8B9251b393131C08a736A67ccB19297",
    lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    oracleReportSanityChecker: "0x147f8d3cf3004FAf9Bf94E88B54b6C06De507be9",
    postTokenRebaseReceiver: "0xbe05d12Fd10919F1881125006523452F6aFF791b",
    burner: "0xE76c52750019b80B43E36DF30bf4060EB73F573a",
    stakingRouter: "0xFdDf38947aFB03C621C71b06C9C70bce73f12999",
    treasury: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    validatorsExitBusOracle: "0x0De4Ea0184c2ad0BacA7183356Aea5B8d5Bf5c6e",
    withdrawalQueue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
    withdrawalVault: "0xB9D7934878B5FB9610B3fE8A5e441e8fad7E293f",
    oracleDaemonConfig: "0xbf05A929c3D7885a6aeAd833a992dA6E5ac23b09",
    topUpGateway: "0x3FC2C71579D80790Aaa3fc7Be8B66ac39dC57374",
    consolidationGateway: "0x17be979344f2c2cC806229a532D92f8742C10462",
    triggerableWithdrawalsGateway: "0xDC00116a0D3E064427dA2600449cfD2566B3037B",
    wstETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    validatorExitDelayVerifier: "0xbDb567672c867DB533119C2dcD4FB9d8b44EC82f",
    accounting: "0x23ED611be0e1a820978875C0122F92260804cdDf",
    vaultHub: "0x1d201BE093d847f6446530Efb0E8Fb426d176709",
    vaultFactory: "0x02Ca7772FF14a9F6c1a08aF385aA96bb1b34175A",
    predepositGuarantee: "0xF4bF42c6D6A0E38825785048124DBAD6c9eaaac3",
    operatorGrid: "0xC69685E89Cefc327b43B7234AC646451B27c544d",
    lazyOracle: "0x5DB427080200c235F2Ae8Cd17A7be87921f7AD6c",
  },
  hoodi: {
    implementation: "0x546d76dd8D4BC0c6a26Cb71a39De5d78E222Cbf8",
    admin: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    accountingOracle: "0xcb883B1bD0a41512b42D2dB267F2A2cd919FB216",
    depositSecurityModule: "0x8E63F0aF403ffd3Cbd5dB18b4ee632314ab49B51",
    elRewardsVault: "0x9b108015fe433F173696Af3Aa0CF7CDb3E104258",
    lido: "0x3508A952176b3c15387C97BE809eaffB1982176a",
    oracleReportSanityChecker: "0xD0261b0032A00a7449ee7fbE14d3f98702996441",
    postTokenRebaseReceiver: "0xe2d1307a8e0eb6996eE9eB6FB5949124F17EDf65",
    burner: "0xb2c99cd38a2636a6281a849C8de938B3eF4A7C3D",
    stakingRouter: "0xCc820558B39ee15C7C45B59390B503b83fb499A8",
    treasury: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    validatorsExitBusOracle: "0x8664d394C2B3278F26A1B44B967aEf99707eeAB2",
    withdrawalQueue: "0xfe56573178f1bcdf53F01A6E9977670dcBBD9186",
    withdrawalVault: "0x4473dCDDbf77679A643BdB654dbd86D67F8d32f2",
    oracleDaemonConfig: "0x2a833402e3F46fFC1ecAb3598c599147a78731a9",
    topUpGateway: "0x10DBEb3367876826d00D21718D1d893e0fbD2956",
    consolidationGateway: "0xC9991Bb865d025364BCbBd99f36e85889Fb68e69",
    triggerableWithdrawalsGateway: "0x6679090D92b08a2a686eF8614feECD8cDFE209db",
    wstETH: "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4",
    validatorExitDelayVerifier: "0xa5F5A9360275390fF9728262a29384399f38d2f0",
    accounting: "0x9b5b78D1C9A3238bF24662067e34c57c83E8c354",
    vaultHub: "0x4C9fFC325392090F789255b9948Ab1659b797964",
    vaultFactory: "0x7Ba269a03eeD86f2f54CB04CA3b4b7626636Df4E",
    predepositGuarantee: "0xa5F55f3402beA2B14AE15Dae1b6811457D43581d",
    operatorGrid: "0x501e678182bB5dF3f733281521D3f3D1aDe69917",
    lazyOracle: "0xf41491C79C30e8f4862d3F4A5b790171adB8e04A",
  },
} as const;

// Source assertions: https://github.com/lidofinance/scripts/blob/d02f8786f138583c521d6406fdbf1b2180a131a8/tests/acceptance/test_locator.py#L14-L61
describe("Locator acceptance", function () {
  let client: DevRpcClient;
  let locator: ReturnType<typeof getGovernanceContracts>["locator"];
  let expected: (typeof configurations)[keyof typeof configurations];

  before(async function (this: Context & { client?: DevRpcClient }) {
    const network = this.client?.getNetworkName() ?? process.env.TEST_NETWORK ?? "mainnet";
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`Acceptance is not configured for ${network}; use --skip-acceptance to skip it explicitly`);
    }
    client = this.client ?? (await createDevRpcClient(network, process.env.TEST_RPC_URL ?? "http://localhost:8545"));
    locator = getGovernanceContracts(network).locator;
    expected = configurations[network];
  });

  it("has the expected proxy implementation and admin", async function () {
    const proxy = contract(OssifiableProxy_ABI, locator.address);
    assert.equal(
      (await client.read(proxy, "proxy__getImplementation")).toLowerCase(),
      expected.implementation.toLowerCase(),
      "implementation",
    );
    assert.equal((await client.read(proxy, "proxy__getAdmin")).toLowerCase(), expected.admin.toLowerCase(), "admin");
  });

  it("has the expected component addresses", async function () {
    for (const field of [
      "accountingOracle",
      "depositSecurityModule",
      "elRewardsVault",
      "lido",
      "oracleReportSanityChecker",
      "postTokenRebaseReceiver",
      "burner",
      "stakingRouter",
      "treasury",
      "validatorsExitBusOracle",
      "withdrawalQueue",
      "withdrawalVault",
      "oracleDaemonConfig",
      "topUpGateway",
      "consolidationGateway",
      "triggerableWithdrawalsGateway",
      "wstETH",
      "validatorExitDelayVerifier",
      "accounting",
      "vaultHub",
      "vaultFactory",
      "predepositGuarantee",
      "operatorGrid",
      "lazyOracle",
    ] as const) {
      assert.equal((await client.read(locator, field)).toLowerCase(), expected[field].toLowerCase(), field);
    }
  });

  it("returns the expected core components in order", async function () {
    assert.deepEqual(
      (await client.read(locator, "coreComponents")).map((address) => address.toLowerCase()),
      [
        expected.elRewardsVault,
        expected.oracleReportSanityChecker,
        expected.stakingRouter,
        expected.treasury,
        expected.withdrawalQueue,
        expected.withdrawalVault,
      ].map((address) => address.toLowerCase()),
      "coreComponents",
    );
  });

  it("returns the expected oracle report components in order", async function () {
    assert.deepEqual(
      (await client.read(locator, "oracleReportComponents")).map((address) => address.toLowerCase()),
      [
        expected.accountingOracle,
        expected.oracleReportSanityChecker,
        expected.burner,
        expected.withdrawalQueue,
        expected.postTokenRebaseReceiver,
        expected.stakingRouter,
        expected.vaultHub,
      ].map((address) => address.toLowerCase()),
      "oracleReportComponents",
    );
  });
});
