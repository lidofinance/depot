import { buildRepo, RepositorySuite, runTestsFromRepo } from "../../src/docker";
import * as env from "../../src/common/env";
import { logBlue } from "../../src/common/color";
import Docker from "dockerode";
import type { ContainerCreateOptions } from "dockerode";
import type { NetworkName } from "../../src/network/network";

export const containerDeps = { buildRepo, runTestsFromRepo };

/**
 * Networks each repo's own CI runs its regressions on;
 * only core has Hoodi (core `.github/workflows/tests-integration-hoodi.yml`)
 */
export const SUITE_NETWORKS: Record<RepositorySuite, readonly NetworkName[]> = {
  core: ["mainnet", "hoodi"],
  "dual-governance": ["mainnet"],
  "staking-modules": ["mainnet"],
  scripts: ["mainnet"],
  stonks: ["mainnet"],
};

export const REPO_BRANCHES: Record<RepositorySuite, () => string> = {
  core: env.GIT_BRANCH_CORE,
  "dual-governance": env.GIT_BRANCH_DG,
  scripts: env.GIT_BRANCH_SCRIPTS,
  "staking-modules": env.GIT_BRANCH_STAKING_MODULES,
  stonks: env.GIT_BRANCH_STONKS,
};

function getDockerLocalRpcUrl() {
  return `http://host.docker.internal:${env.ETH_LOCAL_RPC_PORT()}`;
}

/** `--pattern default` runs the example mounted from `mount/<repo>`, in the path layout each repo expects */
const DEFAULT_PATTERNS: Record<RepositorySuite, string> = {
  core: "test/custom/_example_omnibus_test_for_core_repo.ts",
  scripts: "tests/custom/_example_omnibus_test_for_scripts_repo.py",
  "dual-governance": "test/custom/*",
  "staking-modules": "test/custom/*",
  stonks: "test/custom/_example_omnibus_test_for_stonks_repo.ts",
};

export async function runRepoTests(
  repo: RepositorySuite,
  pattern?: string,
  shouldMountTests = false,
  network: NetworkName = "mainnet",
) {
  const resolvedPattern = pattern === "default" ? DEFAULT_PATTERNS[repo] : pattern;
  if (repo === "core") {
    return runCoreTests(network, resolvedPattern, shouldMountTests);
  } else if (repo === "dual-governance") {
    return runDgTests(resolvedPattern, shouldMountTests);
  } else if (repo === "scripts") {
    return runScriptsTests(resolvedPattern, shouldMountTests);
  } else if (repo === "staking-modules") {
    return runStakingModulesTests(resolvedPattern, shouldMountTests);
  } else if (repo === "stonks") {
    return runStonksTests(resolvedPattern, shouldMountTests);
  }
  throw new Error(`Unsupported repo "${repo}"`);
}

const runCoreTests = async (network: NetworkName, pattern?: string, shouldMountTests = false) => {
  const repo = "core";

  // the pattern is data for bash globbing, never part of the command string
  const cmd = pattern
    ? ["bash", "-c", "shopt -s globstar && yarn test:integration $CORE_TEST_PATTERN"]
    : ["yarn", "test:integration"];

  const config: Docker.ContainerCreateOptions = {
    Env: [
      `RPC_URL=${getDockerLocalRpcUrl()}`,
      `NETWORK=${network}`,
      // as core `.github/workflows/tests-integration-mainnet.yml`
      "NODE_OPTIONS=--max_old_space_size=10240",
      ...(pattern ? [`CORE_TEST_PATTERN=${pattern}`] : []),
    ],
  };

  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/core`, Target: "/usr/src/app/test/custom", Type: "bind" }],
    };
  }

  const imageTag = await containerDeps.buildRepo(repo, REPO_BRANCHES[repo]());
  await runTests(repo, imageTag, cmd, config);
};

const runScriptsTests = async (pattern?: string, shouldMountTests = false) => {
  const repo = "scripts";

  // vote, acceptance and snapshot tests live in depot, the regression suite stays in scripts
  const cmd = !pattern
    ? ["poetry", "run", "brownie", "test", "tests/regression", "--durations=20", "--network", "mfh-1"]
    : ["poetry", "run", "brownie", "test", pattern];

  const config: Docker.ContainerCreateOptions = {
    Env: [
      `PINATA_CLOUD_TOKEN=${env.PINATA_JWT()}`,
      `ETHERSCAN_TOKEN=${env.ETHERSCAN_TOKEN()}`,
      `MAX_GET_LOGS_RANGE=4999`,
      `ETH_RPC_URL=${getDockerLocalRpcUrl()}`,
    ],
  };
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/scripts`, Target: "/root/scripts/tests/custom", Type: "bind" }],
    };
  }

  const imageTag = await containerDeps.buildRepo(repo, REPO_BRANCHES[repo]());
  await runTests(repo, imageTag, cmd, config);
};

const runDgTests = async (pattern?: string, shouldMountTests = false) => {
  const repo = "dual-governance";

  // `--load-accounts` collects stETH/wstETH holders first, as DG `.github/workflows/pull-request.yml` does
  const cmd = !pattern
    ? ["npm", "run", "test:regressions", "--", "--load-accounts"]
    : ["npm", "run", "test", "--", "--match-path", pattern];

  const config: Docker.ContainerCreateOptions = {
    Env: [`MAINNET_RPC_URL=${getDockerLocalRpcUrl()}`, "DEPLOY_ARTIFACT_FILE_NAME=deploy-artifact-mainnet.toml"],
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
  const imageTag = await containerDeps.buildRepo(repo, REPO_BRANCHES[repo]());
  await runTests(repo, imageTag, cmd, config);
};

const runStakingModulesTests = async (pattern?: string, shouldMountTests = false) => {
  const repo = "staking-modules";
  const cmd = pattern
    ? ["forge", "test", "--match-path", pattern, "-vvv", "--show-progress", "--summary", "--detailed"]
    : ["just", "test-integration"];
  const imageTag = await containerDeps.buildRepo(repo, REPO_BRANCHES[repo]());
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

const runStonksTests = async (pattern?: string, shouldMountTests = false) => {
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
  const imageTag = await containerDeps.buildRepo(repo, REPO_BRANCHES[repo]());
  await runTests(repo, imageTag, cmd, config);
};

const runTests = async (
  repo: RepositorySuite,
  imageTag: string,
  cmd: string[],
  config: ContainerCreateOptions,
  instance = 0,
) => {
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  await containerDeps.runTestsFromRepo(repo, imageTag, cmd, config, instance);
};
