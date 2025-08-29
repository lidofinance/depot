import { buildRepo, Repos, RPC_NODE_SETTING, runImageInBackground, runTestsFromRepo } from "../../src/docker";
import * as env from "../../src/common/env";
import { logBlue } from "../../src/common/color";
import Docker from "dockerode";
import type { ContainerCreateOptions } from "dockerode";
import { createDevRpcClient, DevRpcClient, getRpcUrl, NetworkName } from "../../src/network";
import { Omnibus } from "../../src/omnibuses";
import { adoptAragonVoting } from "../../src/aragon-votes-tools";

export const runDepotTests = async (name: string, hideDebug = false) => {
  const repo = "depot";
  const cmd = ["npm", "run", "omnibus:test", name, "--rpc", "local"];
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  const config: Docker.ContainerCreateOptions = {
    HostConfig: {
      Mounts: [{ Source: process.cwd(), Target: "/usr/src/app", Type: "bind" }],
    },
  };
  await buildRepo(repo, "", hideDebug);
  await runTestsFromRepo(repo, "", cmd, config, hideDebug);
  logBlue("Reset node state");
};

export const getRpcUrlByRepoKey = (network: NetworkName, key: string) => {
  const { idx } = RPC_NODE_SETTING[key];
  return getRpcUrl(network, idx);
};

export const prepareLocalRpcNode = async (key: string, network: NetworkName, useOld: boolean) => {
  const networkSuffix = network === "holesky" ? "-holesky-fork" : "";
  const image = `${env.HH_NODE_IMAGE()}${networkSuffix}`;
  const cmd = ["npm", "start"];
  const { port, name } = RPC_NODE_SETTING[key];

  logBlue(`Run ${name} container`);
  await runImageInBackground(name, image, cmd, useOld, {
    Env: [`ETH_RPC_URL=${getRpcUrlByRepoKey(network, key)}`],
    HostConfig: { PortBindings: { "8545/tcp": [{ HostPort: port }] } },
  });

  return `http://localhost:${port}`;
};
/** Snapshot could be reverted once, cleanUpNode revert all snapshots form last to first, so it will trigger last root snapshot if it was unreverted */
const cleanUpNode = async (client: DevRpcClient) => {
  logBlue(`prepare node`);
  const snapshotCount = Number(await client.snapshot());
  for (let ind = snapshotCount; ind >= 0; ind--) {
    await client.revert(`0x${ind.toString(16)}`);
  }
  await client.snapshot();
};

export const prepareRpcNodeWithVoting = async (repo: string, omnibus: Omnibus, instance = 0) => {
  const key = !instance ? repo : `${repo}-${instance}`;
  const rpcUrl = await prepareLocalRpcNode(key, omnibus.network, true);

  const client = await createDevRpcClient(omnibus.network, rpcUrl);
  await cleanUpNode(client);
  try {
    await adoptAragonVoting(client, omnibus.script, omnibus.formatSummary());
  } catch (err) {
    throw err;
  }
};

export const runTests = async (
  omnibus: Omnibus,
  repo: Repos,
  branch: string,
  cmd: string[],
  config: ContainerCreateOptions,
  hideDebug = false,
  instance = 0,
) => {
  await prepareRpcNodeWithVoting(repo, omnibus, instance);
  try {
    logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
    await runTestsFromRepo(repo, branch, cmd, config, hideDebug, instance);
    logBlue(`Success tests from ${repo} repo: \n"${cmd.join(" ")}"`);
  } catch (err) {
    logBlue(`Failed tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    throw err;
  }
};

export const runCoreTests = async (omnibus: Omnibus, pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo: Repos = "core";

  // TODO: remove default option before prod
  const extraPattern = pattern !== "default" ? pattern : "test/custom/_example_omnibus_test_for_core_repo.ts";

  const cmd = !extraPattern
    ? ["yarn", "run", "test:integration:fork:mainnet"]
    : ["yarn", "run", `test:integration:fork:mainnet:custom`, extraPattern];

  const config: Docker.ContainerCreateOptions = {
    Env: [`RPC_URL=${getRpcUrlByRepoKey("mainnet", repo)}`],
  };
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/core`, Target: "/usr/src/app/test/custom", Type: "bind" }],
    };
  }

  await buildRepo(repo, env.GIT_BRANCH_CORE(), hideDebug);
  await runTests(omnibus, repo, env.GIT_BRANCH_CORE(), cmd, config, hideDebug);
};

export const runScriptsTests = async (
  omnibus: Omnibus,
  pattern?: string,
  hideDebug = false,
  shouldMountTests = false,
) => {
  const repo: Repos = "scripts";

  // TODO: remove default option before prod
  const extraPattern = pattern !== "default" ? pattern : "tests/custom/_example_omnibus_test_for_scripts_repo.py";

  const cmd0 = !extraPattern ? ["make", "test-1/2"] : ["poetry", "run", "brownie", "test", extraPattern];
  const cmd1 = !extraPattern ? ["make", "test-2/2"] : ["poetry", "run", "brownie", "test", extraPattern];

  const Env: string[] = [
    `PINATA_CLOUD_TOKEN=${env.PINATA_JWT()}`,
    `ETHERSCAN_TOKEN=${env.ETHERSCAN_TOKEN()}`,
    `SECONDARY_NETWORK=mfh-1`,
    `MAX_GET_LOGS_RANGE=10000`,
  ];
  const config: Docker.ContainerCreateOptions = { Env };
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/scripts`, Target: "/root/scripts/tests/custom", Type: "bind" }],
    };
  }

  const config0 = { ...config, Env: [...Env, `ETH_RPC_URL=${getRpcUrlByRepoKey("mainnet", repo)}`] };
  const config1 = { ...config, Env: [...Env, `ETH_RPC_URL=${getRpcUrlByRepoKey("mainnet", `${repo}-1`)}`] };

  await buildRepo(repo, env.GIT_BRANCH_SCRIPTS(), hideDebug);
  await Promise.all([
    runTests(omnibus, repo, env.GIT_BRANCH_SCRIPTS(), cmd0, config0, hideDebug),
    runTests(omnibus, repo, env.GIT_BRANCH_SCRIPTS(), cmd1, config1, hideDebug, 1),
  ]);
};

export const runDgTests = async (omnibus: Omnibus, pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo: Repos = "dual-governance";

  // TODO: remove default option before prod
  const extraPattern =
    pattern !== "default" ? pattern : "test/custom/_example_omnibus_test_for_dual_governance_repo.t.sol";

  const cmd = !extraPattern
    ? ["npm", "run", "test:regressions", "--", "--load-accounts"]
    : ["npm", "run", "test", "--match-path", extraPattern];

  const config: Docker.ContainerCreateOptions = {
    Env: [`MAINNET_RPC_URL=http://localhost:8545`, `DEPLOY_ARTIFACT_FILE_NAME=deploy-artifact-mainnet.toml`],
  };
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [
        {
          Source: `${process.cwd()}/mount/dual-governance`,
          Target: "/root/dual-governance/test/custom",
          Type: "bind",
        },
      ],
    };
  }
  await buildRepo(repo, env.GIT_BRANCH_DG(), hideDebug);
  await runTests(omnibus, repo, env.GIT_BRANCH_DG(), cmd, config, hideDebug);
};
