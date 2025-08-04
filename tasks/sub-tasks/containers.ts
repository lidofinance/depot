import { Repos, RPC_NODE_SETTING, runImageInBackground, runTestsFromRepo } from "../../src/docker";
import * as env from "../../src/common/env";
import { logBlue } from "../../src/common/color";
import Docker from "dockerode";
import { createDevRpcClient, getRpcUrl, NetworkName } from "../../src/network";
import { revertCurrentNode } from "../../src/rpc";
import { Omnibus } from "../../src/omnibuses";
import { adoptAragonVoting } from "../../src/aragon-votes-tools";

export const runDepotTests = async (name: string, hideDebug = false) => {
  const repo = "depot";
  const cmd = ["pnpm", "omnibus:test", name, "--rpc", "local"];
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  await runTestsFromRepo(repo, "", cmd, hideDebug, {
    HostConfig: {
      Mounts: [{ Source: process.cwd(), Target: "/usr/src/app", Type: "bind" }],
    },
  });
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

export const runCoreTests = async (omnibus: Omnibus, pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo: Repos = "core";
  const revertRpc = await prepareRpcNodeWithVoting(repo, omnibus);
  if (pattern === 'default') {
    // TODO: remove default option before prod
    pattern = "test/custom/_example_omnibus_test_for_core_repo.ts";
  }
  const cmd = !pattern
    ? ["yarn", "run", "test:integration:fork:mainnet"]
    : ["yarn", "run", `test:integration:fork:mainnet:custom`, pattern];
  try {
    const config: Docker.ContainerCreateOptions = {};
    if (shouldMountTests) {
      config.HostConfig = {
        Mounts: [{ Source: `${process.cwd()}/mount/core`, Target: "/usr/src/app/test/custom", Type: "bind" }],
      };
    }
    logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
    await runTestsFromRepo("core", env.GIT_BRANCH_CORE(), cmd, hideDebug, config);
    logBlue(`Success tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
  } catch (err) {
    logBlue(`Failed tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
    throw err;
  }
};

export const runScriptsTests = async (
  omnibus: Omnibus,
  pattern?: string,
  hideDebug = false,
  shouldMountTests = false,
) => {
  const repo: Repos = "scripts";

  const revertRpc = await prepareRpcNodeWithVoting(repo, omnibus);
  if (pattern === 'default') {
    // TODO: remove default option before prod
    pattern = "tests/custom/_example_omnibus_test_for_scripts_repo.py";
  }
  const cmd = !pattern ? ["poetry", "run", "brownie", "test"] : ["poetry", "run", "brownie", "test", pattern];
  try {
    logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
    const config: Docker.ContainerCreateOptions = {
      Env: [`PINATA_CLOUD_TOKEN=${env.PINATA_JWT()}`],
    };
    if (shouldMountTests) {
      config.HostConfig = {
        Mounts: [{ Source: `${process.cwd()}/mount/scripts`, Target: "/root/scripts/tests/custom", Type: "bind" }],
      };
    }

    await runTestsFromRepo(repo, env.GIT_BRANCH_SCRIPTS(), cmd, hideDebug, config);
    logBlue(`Success tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
  } catch (err) {
    logBlue(`Failed tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
    throw err;
  }
};

export const runDgTests = async (omnibus: Omnibus, pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo: Repos = "dual-governance";

  const revertRpc = await prepareRpcNodeWithVoting(repo, omnibus);
  if (pattern === 'default') {
    // TODO: remove default option before prod
    pattern = "test/custom/_example_omnibus_test_for_dual_governance_repo.t.sol";
  }
  const cmd = !pattern ? ["npm", "run", "test"] : ["npm", "run", "test", "--match-path", pattern];
  try {
    logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
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

    await runTestsFromRepo(repo, env.GIT_BRANCH_DG(), cmd, hideDebug, config);
    logBlue(`Success tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
  } catch (err) {
    logBlue(`Failed tests from ${repo} repo: \n"${cmd.join(" ")}"`);
    await revertRpc();
    throw err;
  }
};
