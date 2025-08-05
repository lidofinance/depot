import { Repos, RPC_NODE_SETTING, runImageInBackground, runTestsFromRepo } from "../../src/docker";
import * as env from "../../src/common/env";
import { logBlue } from "../../src/common/color";
import Docker from "dockerode";
import type { ContainerCreateOptions } from "dockerode";
import { createDevRpcClient, getRpcUrl, NetworkName } from "../../src/network";
import { revertCurrentNode } from "../../src/rpc";
import { Omnibus } from "../../src/omnibuses";
import { adoptAragonVoting } from "../../src/aragon-votes-tools";

export const runDepotTests = async (name: string, hideDebug = false) => {
  const repo = "depot";
  const cmd = ["pnpm", "omnibus:test", name, "--rpc", "local"];
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  const config: Docker.ContainerCreateOptions = {
    HostConfig: {
      Mounts: [{ Source: process.cwd(), Target: "/usr/src/app", Type: "bind" }],
    },
  };
  await runTestsFromRepo(repo, "", cmd, config, hideDebug);
  logBlue("Reset node state");
};

export const prepareLocalRpcNode = async (name: string, network: NetworkName, port: string, idx: number) => {
  const canUseCurrentNode = await revertCurrentNode(network);
  if (canUseCurrentNode) {
    console.log(`Local node works on network "${network}" and not modified by other tasks`);
    return;
  }

  const networkSuffix = network === "holesky" ? "-holesky-fork" : "";
  const image = `${env.HH_NODE_IMAGE()}${networkSuffix}`;
  const cmd = ["pnpm", "start"];

  await runImageInBackground(name, image, cmd, true, {
    Env: [`ETH_RPC_URL=${getRpcUrl(network, idx)}`],
    HostConfig: { PortBindings: { "8545/tcp": [{ HostPort: port }] } },
  });
  return `http://localhost:${port}`;
};

export const prepareRpcNodeWithVoting = async (repo: string, omnibus: Omnibus) => {
  const { port, name, idx } = RPC_NODE_SETTING[repo];
  logBlue(`Run ${name} container`);

  const rpcUrl = await prepareLocalRpcNode(name, omnibus.network, port, idx);
  const client = await createDevRpcClient(omnibus.network, rpcUrl);
  const snapshotId = await client.snapshot();
  try {
    await adoptAragonVoting(client, omnibus.script, omnibus.formatSummary());
  } catch (err) {
    await client.revert(snapshotId);
    throw err;
  }
  return () => client.revert(snapshotId);
};

export const runTests = async (
  omnibus: Omnibus,
  repo: Repos,
  branch: string,
  cmd: string[],
  config: ContainerCreateOptions,
  hideDebug = false,
) => {
  const revertRpc = await prepareRpcNodeWithVoting(repo, omnibus);
  try {
    logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
    await runTestsFromRepo(repo, branch, cmd, config, hideDebug);
    logBlue(`Success tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
  } catch (err) {
    logBlue(`Failed tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
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

  const config: Docker.ContainerCreateOptions = {};
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/core`, Target: "/usr/src/app/test/custom", Type: "bind" }],
    };
  }
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

  const cmd = !extraPattern ? ["make", "test-1/2"] : ["poetry", "run", "brownie", "test", extraPattern];
  const config: Docker.ContainerCreateOptions = {
    Env: [`PINATA_CLOUD_TOKEN=${env.PINATA_JWT()}`],
  };
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/scripts`, Target: "/root/scripts/tests/custom", Type: "bind" }],
    };
  }
  await runTests(omnibus, repo, env.GIT_BRANCH_SCRIPTS(), cmd, config, hideDebug);
};

export const runDgTests = async (omnibus: Omnibus, pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo: Repos = "dual-governance";

  // TODO: remove default option before prod
  const extraPattern =
    pattern !== "default" ? pattern : "test/custom/_example_omnibus_test_for_dual_governance_repo.t.sol";

  const cmd = !extraPattern ? ["npm", "run", "test"] : ["npm", "run", "test", "--match-path", extraPattern];

  const config: Docker.ContainerCreateOptions = {
    Env: [`MAINNET_RPC_URL=http://localhost:8545`],
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

  await runTests(omnibus, repo, env.GIT_BRANCH_DG(), cmd, config, hideDebug);
};
