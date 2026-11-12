import { buildRepo, RepositorySuite, runTestsFromRepo } from "@/src/docker";
import * as env from "@/src/common/env";
import Docker from "dockerode";
import type { ContainerCreateOptions } from "dockerode";
import type { NetworkName } from "@/src/network";

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

const runCoreTests = async (network: NetworkName) => {
  const repo = "core";

  const cmd = ["yarn", "test:integration"];

  const config: Docker.ContainerCreateOptions = {
    Env: [
      `RPC_URL=${getDockerLocalRpcUrl()}`,
      `NETWORK=${network}`,
      // as core `.github/workflows/tests-integration-mainnet.yml`
      "NODE_OPTIONS=--max_old_space_size=10240",
    ],
  };

  const imageTag = await buildRepo(repo, REPO_BRANCHES[repo]());
  await runTestsFromRepo(repo, imageTag, cmd, config);
};

const runScriptsTests = async () => {
  const repo = "scripts";

  // vote, acceptance and snapshot tests live in depot, the regression suite stays in scripts
  const cmd = ["poetry", "run", "brownie", "test", "tests/regression", "--durations=20", "--network", "mfh-1"];

  const pinataJwt = env.PINATA_JWT();
  const etherscanToken = env.ETHERSCAN_TOKEN();
  const config: Docker.ContainerCreateOptions = {
    Env: [
      ...(pinataJwt ? [`PINATA_CLOUD_TOKEN=${pinataJwt}`] : []),
      ...(etherscanToken ? [`ETHERSCAN_TOKEN=${etherscanToken}`] : []),
      `MAX_GET_LOGS_RANGE=4999`,
      `ETH_RPC_URL=${getDockerLocalRpcUrl()}`,
    ],
  };

  const imageTag = await buildRepo(repo, REPO_BRANCHES[repo]());
  await runTestsFromRepo(repo, imageTag, cmd, config);
};

const runDgTests = async () => {
  const repo = "dual-governance";

  // `--load-accounts` collects stETH/wstETH holders first, as DG `.github/workflows/pull-request.yml` does
  const cmd = ["npm", "run", "test:regressions", "--", "--load-accounts"];

  const config: Docker.ContainerCreateOptions = {
    Env: [`MAINNET_RPC_URL=${getDockerLocalRpcUrl()}`, "DEPLOY_ARTIFACT_FILE_NAME=deploy-artifact-mainnet.toml"],
  };

  const imageTag = await buildRepo(repo, REPO_BRANCHES[repo]());
  await runTestsFromRepo(repo, imageTag, cmd, config);
};

const runStakingModulesTests = async () => {
  const repo = "staking-modules";
  const cmd = ["just", "test-integration"];
  const imageTag = await buildRepo(repo, REPO_BRANCHES[repo]());
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
    await runTestsFromRepo(repo, imageTag, cmd, config, instance);
  }
};

const runStonksTests = async () => {
  const repo = "stonks";
  const cmd = [
    "npx",
    "hardhat",
    "--config",
    "depot.hardhat.config.ts",
    "test",
    "--network",
    "localhost",
    "test/integration/staking-revenue-source.ts",
    "test/integration/buyback-happy-path.ts",
  ];
  const config: ContainerCreateOptions = {
    Env: [`RPC_URL=${getDockerLocalRpcUrl()}`, "NODE_OPTIONS=--max_old_space_size=6144"],
  };

  const imageTag = await buildRepo(repo, REPO_BRANCHES[repo]());
  await runTestsFromRepo(repo, imageTag, cmd, config);
};

const REPO_TEST_RUNNERS: Record<RepositorySuite, (network: NetworkName) => Promise<void>> = {
  core: runCoreTests,
  "dual-governance": runDgTests,
  scripts: runScriptsTests,
  "staking-modules": runStakingModulesTests,
  stonks: runStonksTests,
};

export async function runRepoTests(repo: RepositorySuite, network: NetworkName) {
  await REPO_TEST_RUNNERS[repo](network);
}
