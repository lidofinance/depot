import { buildRepo, Repos, runTestsFromRepo } from "../../src/docker";
import * as env from "../../src/common/env";
import { logBlue } from "../../src/common/color";
import Docker from "dockerode";
import type { ContainerCreateOptions } from "dockerode";

function getDockerLocalRpcUrl() {
  const localRpc = String(env.ETH_LOCAL_RPC_PORT());
  const hostRpcUrl = /^https?:\/\//i.test(localRpc) ? localRpc : `http://localhost:${localRpc}`;
  return hostRpcUrl
    .replace("://localhost", "://host.docker.internal")
    .replace("://127.0.0.1", "://host.docker.internal");
}

export async function runRepoTests(
  repo: "core" | "dual-governance" | "scripts",
  pattern?: string,
  hideDebug = false,
  shouldMountTests = false,
) {
  if (repo === "core") {
    return runCoreTests(pattern, hideDebug, shouldMountTests);
  } else if (repo === "dual-governance") {
    return runDgTests(pattern, hideDebug, shouldMountTests);
  } else if (repo === "scripts") {
    return runScriptsTests(pattern, hideDebug, shouldMountTests);
  }
  throw new Error(`Unsupported repo "${repo}"`);
}

const runCoreTests = async (
  pattern: string = "test/integration/**/*.ts",
  hideDebug = false,
  shouldMountTests = false,
) => {
  const repo: Repos = "core";

  // same as core's scripts/run-test-integration.sh, but with a custom test pattern
  const cmd = [
    "bash",
    "-c",
    `. scripts/utils/migration-env.sh && prepare_migration_env test && yarn hardhat --network "$RUN_NETWORK" test ${pattern} --disabletracer`,
  ];

  const config: Docker.ContainerCreateOptions = {
    Env: [
      `LOCAL_RPC_URL=${getDockerLocalRpcUrl()}`,
      `RPC_URL=${getDockerLocalRpcUrl()}`,
      "NETWORK=mainnet",
      "RUN_NETWORK=local",
      "MODE=forking",
      "AUTO_CONFIRM=true",
      "ALLOW_SKIP_STEPS=true",
      "SKIP_INTERFACES_CHECK=true",
      "SKIP_CONTRACT_SIZE=true",
      "SKIP_GAS_REPORT=true",
      "SKIP_LINT_SOLIDITY=true",
    ],
  };

  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/core`, Target: "/usr/src/app/test/custom", Type: "bind" }],
    };
  }

  const imageTag = await buildRepo(repo, env.GIT_BRANCH_CORE(), hideDebug);
  await runTests(repo, imageTag, cmd, config);
};

const runScriptsTests = async (pattern?: string, hideDebug = false, shouldMountTests = false) => {
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

  const config0 = { ...config, Env: [...Env, `ETH_RPC_URL=${getDockerLocalRpcUrl()}`] };
  const config1 = { ...config, Env: [...Env, `ETH_RPC_URL=${getDockerLocalRpcUrl()}`] };

  const imageTag = await buildRepo(repo, env.GIT_BRANCH_SCRIPTS(), hideDebug);
  await Promise.all([runTests(repo, imageTag, cmd0, config0), runTests(repo, imageTag, cmd1, config1, 1)]);
};

const runDgTests = async (pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo: Repos = "dual-governance";

  const cmd = !pattern
    ? ["npm", "run", "test:regressions", "--", "--load-accounts"]
    : ["npm", "run", "test", "--", "--match-path", pattern];

  const config: Docker.ContainerCreateOptions = {
    Env: [`MAINNET_RPC_URL=${getDockerLocalRpcUrl()}`, `DEPLOY_ARTIFACT_FILE_NAME=deploy-artifact-mainnet.toml`],
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
  const imageTag = await buildRepo(repo, env.GIT_BRANCH_DG(), hideDebug);
  await runTests(repo, imageTag, cmd, config);
};

const runTests = async (repo: Repos, imageTag: string, cmd: string[], config: ContainerCreateOptions, instance = 0) => {
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  await runTestsFromRepo(repo, imageTag, cmd, config, instance);
};
