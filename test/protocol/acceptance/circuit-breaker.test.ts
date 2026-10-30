import { assert } from "chai";
import { parseAbi } from "viem";
import { contract } from "@/src/contracts";
import { DevRpcClient } from "@/src/network";
import { connectAcceptanceClient, getAcceptanceNetwork } from "@/test/protocol/helpers/client";

const circuitBreakerAbi = parseAbi([
  "function ADMIN() view returns (address)",
  "function MIN_PAUSE_DURATION() view returns (uint256)",
  "function MAX_PAUSE_DURATION() view returns (uint256)",
  "function MIN_HEARTBEAT_INTERVAL() view returns (uint256)",
  "function MAX_HEARTBEAT_INTERVAL() view returns (uint256)",
  "function pauseDuration() view returns (uint256)",
  "function heartbeatInterval() view returns (uint256)",
  "function getPausables() view returns (address[])",
  "function getPauser(address pausable) view returns (address)",
  "function getPausableCount(address pauser) view returns (uint256)",
  "function isPauserLive(address pauser) view returns (bool)",
  "function heartbeatExpiry(address pauser) view returns (uint256)",
]);
const accessControlAbi = parseAbi([
  "function PAUSE_ROLE() view returns (bytes32)",
  "function RESUME_ROLE() view returns (bytes32)",
  "function getRoleMember(bytes32 role, uint256 index) view returns (address)",
  "function getRoleMemberCount(bytes32 role) view returns (uint256)",
]);

const configurations = {
  mainnet: {
    circuitBreaker: "0x6019CB557978296BA3C08a7B73225C0975DFB2F7",
    agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
    resealManager: "0x7914b5a1539b97Bd0bbd155757F25FD79A522d24",
    pausables: [
      ["0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1", "0x8772E3a2D86B9347A2688f9bc1808A6d8917760C"],
      ["0x0De4Ea0184c2ad0BacA7183356Aea5B8d5Bf5c6e", "0x8772E3a2D86B9347A2688f9bc1808A6d8917760C"],
      ["0xDC00116a0D3E064427dA2600449cfD2566B3037B", "0x8772E3a2D86B9347A2688f9bc1808A6d8917760C"],
      ["0x1d201BE093d847f6446530Efb0E8Fb426d176709", "0x8772E3a2D86B9347A2688f9bc1808A6d8917760C"],
      ["0xF4bF42c6D6A0E38825785048124DBAD6c9eaaac3", "0x8772E3a2D86B9347A2688f9bc1808A6d8917760C"],
      ["0x17be979344f2c2cC806229a532D92f8742C10462", "0x8772E3a2D86B9347A2688f9bc1808A6d8917760C"],
      ["0x3FC2C71579D80790Aaa3fc7Be8B66ac39dC57374", "0x8772E3a2D86B9347A2688f9bc1808A6d8917760C"],
      ["0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0x4d72BFF1BeaC69925F8Bd12526a39BAAb069e5Da", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0x4D4074628678Bd302921c20573EEa1ed38DdF7FB", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0xfce7aB839e55de77730716D05b3553e45ab3A5Ba", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0xB314D4A76C457c93150d308787939063F4Cc67E0", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0x610B517D380f287c239C93F8eF6FfBd567AA4bA5", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0xa12760721A72A7199aB38059DA6690b9Cd4ed7B8", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0xDa5F930cE326EB5205085D66c72A4E79d60cB8C1", "0x2570e0b22AD904501dfB0d49575991ACB801dD91"],
      ["0x2F91e3A8C5d6593bf4F8403fCfeCcd62dF59f6F6", "0x2570e0b22AD904501dfB0d49575991ACB801dD91"],
      ["0x8EeFCdbD984c30E472BcbF545783D051CB5114e5", "0x2570e0b22AD904501dfB0d49575991ACB801dD91"],
      ["0xC392F457960f1B13Ebaf1aa6C065479dD507E1E3", "0x2570e0b22AD904501dfB0d49575991ACB801dD91"],
      ["0xe181A377A2d2BDE9A83f1474BC3DB7A412de091E", "0x2570e0b22AD904501dfB0d49575991ACB801dD91"],
      ["0x792Cd25e4aE3578375031FB55e048E163A804F7B", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0x3696dDd942A9e156F5D4728505D1b9a32dCef900", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0x0fB5EC09Cc975d8E1aF43063e51882798814f311", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0x69b4C32a43565e768794D41b4A265F86dE61b861", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
      ["0x2EE500885870b020e84E86a09A5d26D1EEec3E5E", "0xC52fC3081123073078698F1EAc2f1Dc7Bd71880f"],
    ],
    values: {
      initialHeartbeatInterval: 31536000,
      initialPauseDuration: 1814400,
      maxHeartbeatInterval: 94608000,
      maxPauseDuration: 5184000,
      minHeartbeatInterval: 2592000,
      minPauseDuration: 432000,
    },
  },
  hoodi: {
    circuitBreaker: "0x44a5789dFeDa59cD176Ab5709ec2F4829dE4d555",
    agent: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
    resealManager: "0x05172CbCDb7307228F781436b327679e4DAE166B",
    pausables: [
      ["0xfe56573178f1bcdf53F01A6E9977670dcBBD9186", "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102"],
      ["0x8664d394C2B3278F26A1B44B967aEf99707eeAB2", "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102"],
      ["0x6679090D92b08a2a686eF8614feECD8cDFE209db", "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102"],
      ["0x4C9fFC325392090F789255b9948Ab1659b797964", "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102"],
      ["0xa5F55f3402beA2B14AE15Dae1b6811457D43581d", "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102"],
      ["0xC9991Bb865d025364BCbBd99f36e85889Fb68e69", "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102"],
      ["0x10DBEb3367876826d00D21718D1d893e0fbD2956", "0x83BCE68B4e8b7071b2a664a26e6D3Bc17eEe3102"],
      ["0x79CEf36D84743222f37765204Bec41E92a93E59d", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0xA54b90BA34C5f326BC1485054080994e38FB4C60", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0xe7314f561B2e72f9543F1004e741bab6Fc51028B", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0xC96406b0eADdAC5708aFCa04DcCA67BAdC9642Fd", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0x10a254E724fe2b7f305F76f3F116a3969c53845f", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0xCAe028378d69D54dc8bF809e6C44CF751F997b80", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0x887F8512F9998045f4b5993e6eaa6BCfE5F02A94", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0x87EB69Ae51317405FD285efD2326a4a11f6173b9", "0x84DffcfB232594975C608DE92544Ff239a24c9E9"],
      ["0x7f7356D29aCd915F1934220956c3305808ceB235", "0x84DffcfB232594975C608DE92544Ff239a24c9E9"],
      ["0x5D2F27000C80f6f7A03015Fd49dB7FEba3fBfa83", "0x84DffcfB232594975C608DE92544Ff239a24c9E9"],
      ["0x209190Ebc2Be80367a15d05e626784Eb94d6A880", "0x84DffcfB232594975C608DE92544Ff239a24c9E9"],
      ["0xfDbde2B3554B69C84e0f8d7daB68D390Ff0f4394", "0x84DffcfB232594975C608DE92544Ff239a24c9E9"],
      ["0xbb7dd81FAC80f3Effa10eA8b973c15AE65a4CAf9", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0x04A0294bF3306532309D7DD776D4A7eF502313e0", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0x9B8bBA11bbE1a351CC8dD1CFCa6719FF7274A208", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0xFdE0FD9aDa4E898D3b34Dd4EA3433b75f0B6dd30", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0xf8a71C08DBe7D2efaD76D3951a3065B8cE20e4f0", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0x1773b2Ff99A030F6000554Cb8A5Ec93145650cbA", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
      ["0x777bd76326E4aDcD353b03AD45b33BAF41048476", "0x4AF43Ee34a6fcD1fEcA1e1F832124C763561dA53"],
    ],
    values: {
      initialHeartbeatInterval: 31536000,
      initialPauseDuration: 3600,
      maxHeartbeatInterval: 94608000,
      maxPauseDuration: 2592000,
      minHeartbeatInterval: 60,
      minPauseDuration: 60,
    },
  },
} as const;

describe("Circuit Breaker acceptance", function () {
  // Network is needed while collecting per-pausable tests, before any hook runs
  const network = getAcceptanceNetwork(this.ctx);
  const expected = configurations[network];
  const circuitBreaker = contract(circuitBreakerAbi, expected.circuitBreaker);
  const pausers = [...new Set(expected.pausables.map(([, pauser]) => pauser))];
  let client: DevRpcClient;

  before(async function () {
    client = await connectAcceptanceClient(this, network);
  });

  it("has the expected administrator, durations and bounds", async function () {
    assert.equal(
      (await client.read(circuitBreaker, "ADMIN")).toLowerCase(),
      expected.agent.toLowerCase(),
      "administrator",
    );
    const circuitBreakerValues = expected.values;
    for (const [name, value] of [
      ["MIN_PAUSE_DURATION", circuitBreakerValues.minPauseDuration],
      ["MAX_PAUSE_DURATION", circuitBreakerValues.maxPauseDuration],
      ["MIN_HEARTBEAT_INTERVAL", circuitBreakerValues.minHeartbeatInterval],
      ["MAX_HEARTBEAT_INTERVAL", circuitBreakerValues.maxHeartbeatInterval],
      ["pauseDuration", circuitBreakerValues.initialPauseDuration],
      ["heartbeatInterval", circuitBreakerValues.initialHeartbeatInterval],
    ] as const) {
      assert.equal(await client.read(circuitBreaker, name), BigInt(value), name);
    }
    assert.isTrue(
      0 < circuitBreakerValues.minPauseDuration &&
        circuitBreakerValues.minPauseDuration <= circuitBreakerValues.initialPauseDuration &&
        circuitBreakerValues.initialPauseDuration <= circuitBreakerValues.maxPauseDuration,
      "pause duration bounds",
    );
    assert.isTrue(
      0 < circuitBreakerValues.minHeartbeatInterval &&
        circuitBreakerValues.minHeartbeatInterval <= circuitBreakerValues.initialHeartbeatInterval &&
        circuitBreakerValues.initialHeartbeatInterval <= circuitBreakerValues.maxHeartbeatInterval,
      "heartbeat interval bounds",
    );
  });

  it("has exactly the expected pausables", async function () {
    assert.sameMembers(
      (await client.read(circuitBreaker, "getPausables")).map((address) => address.toLowerCase()),
      expected.pausables.map(([address]) => address.toLowerCase()),
      "pausables",
    );
  });

  describe("pauser assignments", function () {
    for (const [pausable, pauser] of expected.pausables) {
      it(`assigns ${pausable} to ${pauser}`, async function () {
        assert.equal(
          (await client.read(circuitBreaker, "getPauser", [pausable])).toLowerCase(),
          pauser.toLowerCase(),
          "pauser",
        );
      });
    }
  });

  describe("pausable counts", function () {
    for (const pauser of pausers) {
      it(`counts all pausables for ${pauser}`, async function () {
        const count = expected.pausables.filter(([, address]) => address === pauser).length;
        assert.equal(await client.read(circuitBreaker, "getPausableCount", [pauser]), BigInt(count), "pausable count");
      });
    }
  });

  describe("pause role holders", function () {
    for (const [pausable] of expected.pausables) {
      it(`gives the pause role on ${pausable} exactly to Circuit Breaker and Reseal Manager`, async function () {
        const target = contract(accessControlAbi, pausable);
        const role = await client.read(target, "PAUSE_ROLE");
        assert.equal(await client.read(target, "getRoleMemberCount", [role]), 2n, "pause role count");
        const holders = await Promise.all([0n, 1n].map((index) => client.read(target, "getRoleMember", [role, index])));
        assert.sameMembers(
          holders.map((address) => address.toLowerCase()),
          [expected.circuitBreaker, expected.resealManager].map((address) => address.toLowerCase()),
          "pause role holders",
        );
      });
    }
  });

  describe("resume role holders", function () {
    for (const [pausable] of expected.pausables) {
      it(`gives the resume role on ${pausable} only to Reseal Manager`, async function () {
        const target = contract(accessControlAbi, pausable);
        const role = await client.read(target, "RESUME_ROLE");
        assert.equal(await client.read(target, "getRoleMemberCount", [role]), 1n, "resume role count");
        assert.equal(
          (await client.read(target, "getRoleMember", [role, 0n])).toLowerCase(),
          expected.resealManager.toLowerCase(),
          "resume role holder",
        );
      });
    }
  });

  describe("pauser liveness", function () {
    for (const pauser of pausers) {
      it(`keeps ${pauser} live with an unexpired heartbeat`, async function () {
        assert.isTrue(await client.read(circuitBreaker, "isPauserLive", [pauser]), "pauser is live");
        const expiry = await client.read(circuitBreaker, "heartbeatExpiry", [pauser]);
        const block = await client.viemClient.getBlock({ blockTag: "latest" });
        assert.isTrue(expiry > block.timestamp, `heartbeat expiry=${expiry}, block.timestamp=${block.timestamp}`);
      });
    }
  });
});
