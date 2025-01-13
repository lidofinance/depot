import { runImageInBackground, runTestsFromRepo } from "../../src/docker";
import env from "../../src/common/env";
import { logBlue } from "../../src/common/color";
import Docker from "dockerode";
import { JsonRpcProvider } from "ethers";


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

export const runRpcNodeBackground = async (name: string, port: string, forceRestart = false) => {
  const image = env.HH_NODE_IMAGE();
  const cmd = ["pnpm", "start"];

  const container = await runImageInBackground(name, image, cmd, forceRestart, {
    Env: [`ALCHEMY_TOKEN=${env.ALCHEMY_TOKEN()}`],
    HostConfig: { PortBindings: { "8545/tcp": [{ HostPort: port }] } },
  });

  const url = `http:/localhost:${port}`;
  const provider = new JsonRpcProvider(url);

  return {
    container,
    provider,
  };
};

export const runCoreTests = async (pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo = "core";
  const cmd = !pattern
    ? ["yarn", "run", "test:integration:fork:mainnet"]
    : ["yarn", "run", `test:integration:fork:mainnet:custom`, pattern];
  const config: Docker.ContainerCreateOptions = {};
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/core`, Target: "/usr/src/app/test/custom", Type: "bind" }],
    };
  }
  console.log(config);
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  await runTestsFromRepo("core", env.GIT_BRANCH_CORE(), cmd, hideDebug, config);
};

export const runScriptsTests = async (voteId: number, pattern?: string, hideDebug = false, shouldMountTests = false) => {
  const repo = "scripts";
  const cmd = !pattern ? ["poetry", "run", "brownie", "test"] : ["poetry", "run", "brownie", "test", pattern];
  logBlue(`Running test from ${repo} repo: \n"${cmd.join(" ")}"`);
  const config: Docker.ContainerCreateOptions = {
    Env: [`PINATA_CLOUD_TOKEN=${env.PINATA_JWT()}`, `OMNIBUS_VOTE_IDS=${voteId}`],
  };
  if (shouldMountTests) {
    config.HostConfig = {
      Mounts: [{ Source: `${process.cwd()}/mount/scripts`, Target: "/root/scripts/tests/custom", Type: "bind" }],
    };
  }

  await runTestsFromRepo(repo, env.GIT_BRANCH_SCRIPTS(), cmd, hideDebug, config);
};
