import { buildRepo, Repos, runTestsFromRepo } from "../../src/docker";
import * as env from "../../src/common/env";
import { logBlue } from "../../src/common/color";
import Docker from "dockerode";
import type { ContainerCreateOptions } from "dockerode";

export const containerDeps = { buildRepo, runTestsFromRepo };

function getDockerLocalRpcUrl() {
  const localRpc = String(env.ETH_LOCAL_RPC_PORT());
  const hostRpcUrl = /^https?:\/\//i.test(localRpc) ? localRpc : `http://localhost:${localRpc}`;
  return hostRpcUrl
    .replace("://localhost", "://host.docker.internal")
    .replace("://127.0.0.1", "://host.docker.internal");
}

export async function runRepoTests(
  repo: Exclude<Repos, "depot">,
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
  } else if (repo === "staking-modules") {
    return runStakingModulesTests(pattern, hideDebug, shouldMountTests);
  } else if (repo === "stonks") {
    return runStonksTests(pattern, hideDebug, shouldMountTests);
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

  const imageTag = await containerDeps.buildRepo(repo, env.GIT_BRANCH_CORE(), hideDebug);
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

  const imageTag = await containerDeps.buildRepo(repo, env.GIT_BRANCH_SCRIPTS(), hideDebug);
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
  const imageTag = await containerDeps.buildRepo(repo, env.GIT_BRANCH_DG(), hideDebug);
  await runTests(repo, imageTag, cmd, config);
};

const runStakingModulesTests = async (pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo = "staking-modules";
  const cmd = pattern
    ? ["forge", "test", "--match-path", pattern, "-vvv", "--show-progress", "--summary", "--detailed"]
    : ["just", "test-integration"];
  const imageTag = await containerDeps.buildRepo(repo, env.GIT_BRANCH_STAKING_MODULES(), hideDebug);
  const deployments = [
    "./artifacts/mainnet/csm/upgrade-v3-mainnet.json",
    "./artifacts/mainnet/curated/deploy-mainnet.json",
  ];

  for (const [instance, deployment] of deployments.entries()) {
    const config: ContainerCreateOptions = {
      Env: [
        `RPC_URL=${getDockerLocalRpcUrl()}`,
        "CHAIN=mainnet",
        "FOUNDRY_PROFILE=ci_quick",
        `DEPLOY_CONFIG=${deployment}`,
      ],
    };
    if (shouldMountTests) {
      config.HostConfig = {
        Mounts: [
          { Source: `${process.cwd()}/mount/staking-modules`, Target: "/usr/src/app/test/custom", Type: "bind" },
        ],
      };
    }
    await runTests(repo, imageTag, cmd, config, instance);
  }
};

const runStonksTests = async (pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo = "stonks";
  const cmd = [
    "bash",
    "-c",
    "shopt -s globstar && npx hardhat --config depot.hardhat.config.ts test --network localhost $STONKS_TEST_PATTERN",
  ];
  const config: ContainerCreateOptions = {
    Env: [
      `RPC_URL=${getDockerLocalRpcUrl()}`,
      `STONKS_TEST_PATTERN=${pattern ?? "test/integration/staking-revenue-source.ts test/integration/buyback-happy-path.ts"}`,
      "NODE_OPTIONS=--max_old_space_size=6144",
    ],
  };
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/stonks`, Target: "/usr/src/app/test/custom", Type: "bind" }],
    };
  }
  const imageTag = await containerDeps.buildRepo(repo, env.GIT_BRANCH_STONKS(), hideDebug);
  await runTests(repo, imageTag, cmd, config);
};

const runTests = async (repo: Repos, imageTag: string, cmd: string[], config: ContainerCreateOptions, instance = 0) => {
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  await containerDeps.runTestsFromRepo(repo, imageTag, cmd, config, instance);
};
