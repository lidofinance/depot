import { assert } from "chai";
import { type Address, toHex } from "viem";
import { assertSnapshot, getSnapshotContext } from "@/test/protocol/helpers/snapshot";
import { readStorageArray, readStorageWord } from "@/test/protocol/helpers/storage";

const configurations = {
  mainnet: [
    ["Lido", "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"],
    ["NodeOperatorsRegistry", "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5"],
    ["DepositSecurityModule", "0x39BB5d491e98A44D1bfe8047A737a81E296a63E0"],
    ["ELRewardsVault", "0x388C818CA8B9251b393131C08a736A67ccB19297"],
    ["WithdrawalVault", "0xB9D7934878B5FB9610B3fE8A5e441e8fad7E293f"],
    ["OracleDaemonConfig", "0xbf05A929c3D7885a6aeAd833a992dA6E5ac23b09"],
    ["Burner", "0xE76c52750019b80B43E36DF30bf4060EB73F573a"],
    ["RelayAllowedList", "0xF95f069F9AD107938F6ba802a3da87892298610E"],
    ["LDO", "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32"],
    ["TokenManager", "0xf73a1260d222f447210581DDf212D915c09a3249"],
    ["Finance", "0xB9E5CBB9CA5b0d659238807E84D0176930753d86"],
    ["ACL", "0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb"],
    ["Agent", "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c"],
    ["Kernel", "0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc"],
    ["EasyTrack", "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea"],
    ["wstETH", "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"],
    ["CSM", "0xdA7dE2ECdDfccC6c3AF10108Db212ACBBf9EA83F"],
    ["CSAccounting", "0x4d72BFF1BeaC69925F8Bd12526a39BAAb069e5Da"],
    ["CSFeeDistributor", "0xD99CC66fEC647E68294C6477B40fC7E0F6F618D0"],
    ["CSFeeOracle", "0x4D4074628678Bd302921c20573EEa1ed38DdF7FB"],
    ["CSMHashConsensus", "0x71093efF8D8599b5fA340D665Ad60fA7C80688e4"],
    ["CSVerifierV2", "0xdC5FE1782B6943f318E05230d688713a560063DC"],
  ],
  hoodi: [
    ["Lido", "0x3508A952176b3c15387C97BE809eaffB1982176a"],
    ["NodeOperatorsRegistry", "0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5"],
    ["DepositSecurityModule", "0x8E63F0aF403ffd3Cbd5dB18b4ee632314ab49B51"],
    ["ELRewardsVault", "0x9b108015fe433F173696Af3Aa0CF7CDb3E104258"],
    ["WithdrawalVault", "0x4473dCDDbf77679A643BdB654dbd86D67F8d32f2"],
    ["OracleDaemonConfig", "0x2a833402e3F46fFC1ecAb3598c599147a78731a9"],
    ["Burner", "0x4e9A9ea2F154bA34BE919CD16a4A953DCd888165"],
    ["RelayAllowedList", "0x279d3A456212a1294DaEd0faEE98675a52E8A4Bf"],
    ["LDO", "0xEf2573966D009CcEA0Fc74451dee2193564198dc"],
    ["TokenManager", "0x8ab4a56721Ad8e68c6Ad86F9D9929782A78E39E5"],
    ["Finance", "0x254Ae22bEEba64127F0e59fe8593082F3cd13f6b"],
    ["ACL", "0x78780e70Eae33e2935814a327f7dB6c01136cc62"],
    ["Agent", "0x0534aA41907c9631fae990960bCC72d75fA7cfeD"],
    ["Kernel", "0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d"],
    ["EasyTrack", "0x284D91a7D47850d21A6DEaaC6E538AC7E5E6fc2a"],
    ["wstETH", "0x7E99eE3C66636DE415D2d7C880938F2f40f94De4"],
    ["CSM", "0x79CEf36D84743222f37765204Bec41E92a93E59d"],
    ["CSAccounting", "0xA54b90BA34C5f326BC1485054080994e38FB4C60"],
    ["CSFeeDistributor", "0xaCd9820b0A2229a82dc1A0770307ce5522FF3582"],
    ["CSFeeOracle", "0xe7314f561B2e72f9543F1004e741bab6Fc51028B"],
    ["CSMHashConsensus", "0x54f74a10e4397dDeF85C4854d9dfcA129D72C637"],
    ["CSVerifierV2", "0xf805b3711cBB48F15Ae2bb27095ddC38c5339968"],
  ],
} as const satisfies Record<string, readonly (readonly [string, Address])[]>;

describe("First slots snapshot", function () {
  it("preserves the sampled root slots and bounded array words at the same block and time", async function () {
    const context = getSnapshotContext(this);
    const { client, config, testUpgrade } = context;
    const network = client.getNetworkName();
    if (network !== "mainnet" && network !== "hoodi") {
      throw new Error(`First-slots snapshot is not configured for ${network}`);
    }
    const targets = configurations[network];

    let targetBlock = 0n;
    let targetTimestamp = 0n;
    let before: Record<string, unknown> = {};

    async function align(): Promise<void> {
      const current = await client.viemClient.getBlock({ blockTag: "latest" });
      assert.isTrue(current.number <= targetBlock, "upgrade exceeded the target block");
      assert.isTrue(current.timestamp <= targetTimestamp, "upgrade exceeded the target timestamp");
      const remaining = targetBlock - current.number;
      if (remaining === 0n) {
        assert.equal(current.timestamp, targetTimestamp, "target block timestamp");
        return;
      }
      assert.isTrue(targetTimestamp - current.timestamp >= remaining, "time remaining for block alignment");
      if (remaining > 1n) {
        await client.mine(remaining - 1n, 1n);
      }
      await client.setTime(targetTimestamp);
    }

    async function capture(): Promise<Record<string, unknown>> {
      const snapshot: Record<string, unknown> = {};
      for (const [, address] of targets) {
        for (let slot = 0n; slot < 16n; slot++) {
          const key = `${address.toLowerCase()}/${toHex(slot, { size: 32 })}`;
          const word = await readStorageWord(client, address, slot, targetBlock);
          snapshot[key] = word;
          const length = BigInt(word);
          if (length > 0n && length < 32n) {
            snapshot[`${key}/array`] = await readStorageArray(client, address, slot, length, targetBlock);
          }
        }
      }
      for (const { address, slot } of config.storage ?? []) {
        const key = `${address.toLowerCase()}/${toHex(BigInt(slot), { size: 32 })}`;
        snapshot[key] = await readStorageWord(client, address, slot, targetBlock);
      }
      return snapshot;
    }

    await testUpgrade({
      beforeExecution: async () => {
        const initial = await client.viemClient.getBlock({ blockTag: "latest" });
        targetBlock = initial.number + 1_000n;
        targetTimestamp = initial.timestamp + 14n * 24n * 60n * 60n;
        before = await client.withSnapshot(async () => {
          await align();
          return capture();
        });
      },
      afterExecution: async () => {
        await align();
        const after = await capture();
        const upgradedObservations: Record<string, unknown> = {};
        for (const key of Object.keys(before)) {
          assert.property(after, key, `missing upgraded storage observation: ${key}`);
          upgradedObservations[key] = after[key];
        }
        assertSnapshot(context, "first-slots/init", before, upgradedObservations);
      },
    });
  });
});
