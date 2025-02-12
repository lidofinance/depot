import Docker, { Container } from "dockerode";
import * as env from "../common/env";
import process from "node:process";
import chalk from "chalk";
import { createWriteStream } from "node:fs";
import { logGreen } from "../common/color";

export const CONTAINER_NAMES = {
  /** rpc where vote will be not reverted after enact */
  RPC_DIRTY_NODE: "rpc-dirty-node",
  /** rpc where changes will be reverted */
  RPC_CLEAN_NODE: "rpc-clean-node",
};

type ContainerRunResponse = [{ StatusCode: number }, Container, id: string, Record<string, {}>];

const docker = new Docker();

export function getStdout(name: string) {
  const logFilePath = `${process.cwd()}/logs/${name}.log`;
  logGreen(`You will able to see container log here: \n${logFilePath}`);
  return createWriteStream(logFilePath);
}

/** Stop docker container and rename if isTmpContainer is true */
export async function stopContainer(container: Container, name: string, isTmpContainer = false): Promise<void> {
  console.log(chalk.bold.green(`Stop container ${name} `));
  if (isTmpContainer) {
    const tmpName = `${name}-rm-${Date.now()}`;
    console.log(chalk.bold.green(`Rename container ${name} to ${tmpName}`));
    // rename old container to use new container with same name in same tread
    await container.rename({ name: tmpName });
  }
  await container.stop();
}

export async function findContainerByName(name: string) {
  const containersInfo = await docker.listContainers();

  const containerInfo = containersInfo.find(({ Names }) => Names?.some((item) => item.endsWith(name)));
  return containerInfo ? docker.getContainer(containerInfo?.Id) : null;
}

const delay = (ms: number) => new Promise<undefined>((resolve) => setTimeout(resolve, ms));
const waitMessage = async (logs: NodeJS.ReadableStream, msg: string) =>
  new Promise<string>((resolve) => {
    logs.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes(msg)) {
        resolve(msg);
        return;
      }
    });
  });

export async function runImageInBackground(
  name: string,
  image: string,
  cmd: string[],
  forceRestart = true,
  config?: Docker.ContainerCreateOptions,
) {
  logGreen(`Prepare container ${image} for run in background`);

  const containerOld = await findContainerByName(name);

  if (!forceRestart && containerOld) {
    logGreen(`Previous hardhat-node container found and will be used`);
    return containerOld;
  }

  if (forceRestart && containerOld) {
    logGreen(`Previous hardhat-node container found`);
    await stopContainer(containerOld, name, true);
  }

  const stdout = getStdout(name);

  // not working with await yet
  /* await */ docker.run(image, cmd, stdout, {
    Tty: false,
    name,
    ...config,
    HostConfig: { AutoRemove: true, ...config?.HostConfig },
  });
  logGreen(`Wait for hardhat-node container launch`);

  // TODO: add background run to hardhat container node instead
  await delay(1_000);

  const container = await findContainerByName(name);
  if (!container) {
    throw new Error(`Could not find container ${name}`);
  }
  const logs = await container.logs({ follow: true, stdout: true });

  logGreen(`Wait for hardhat-node container initiated`);
  const result = await Promise.race([delay(10_000), waitMessage(logs, "Started HTTP and WebSocket JSON-RPC server")]);

  console.log(result ? chalk.bold.green(result) : chalk.bold.red("hardhat-node container initiated timeout"));
  return result ? container : null;
}

type Repos = "core" | "depot" | "scripts";

async function getLastCommitSha(org: string, repo: string, branch: string) {
  const url = `https://api.github.com/repos/${org}/${repo}/commits/${branch}`;
  const response = await fetch(url);
  console.log(url);
  const item = await response.json();
  if (!item?.sha) {
    throw new Error(`Could not received a commit information for "${repo}"`);
  }
  return item.sha as string;
}

export async function runTestsFromRepo(
  repo: Repos,
  branch: string,
  cmd: string[],
  hideDebug = false,
  config?: Docker.ContainerCreateOptions,
) {
  const docker = new Docker();
  let buildVersion;
  const org = env.GITHUB_ORG();
  if (branch) {
    const sha = await getLastCommitSha(org, repo, branch);
    buildVersion = sha?.slice(0, 6);
  } else {
    // TODO: ask about rebuild or verify changes somehow
    buildVersion = "latest";
  }
  const imageTag = `lido-${repo}:${buildVersion}`;

  const images = await docker.listImages();
  const image = images.find(({ RepoTags }) => RepoTags?.includes(imageTag));

  const stdout = hideDebug ? getStdout(repo) : process.stdout;

  if (!image) {
    console.log(`Image for ${repo} not found.`);
    console.log(`Creating image to run fast next time`);
    const stream = await docker.buildImage(
      {
        context: process.cwd(),
        src: [`tests@${repo}.Dockerfile`],
      },
      {
        t: imageTag,
        dockerfile: `tests@${repo}.Dockerfile`,
        buildargs: { GIT_BRANCH: branch, BUILD_VERSION: buildVersion, GITHUB_ORG: org },
      },
    );
    stream.pipe(stdout);

    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });
  }

  const container = await findContainerByName(repo);

  if (container) {
    await stopContainer(container, repo, true);
  }

  logGreen(`Running command on image ${repo}: \n"${cmd.join(" ")}"`);
  const data: ContainerRunResponse = await docker.run(imageTag, cmd, stdout, {
    Tty: false,
    name: repo,
    ...config,
    HostConfig: { AutoRemove: true, NetworkMode: "host", ...config?.HostConfig },
  });

  const [statusInfo] = data;

  if (!statusInfo.hasOwnProperty?.("StatusCode")) {
    throw new Error(`Container ${imageTag} stop working, but status code not found`);
  }

  if (statusInfo?.StatusCode) {
    throw new Error(`Container ${imageTag} stop working, with status code ${statusInfo.StatusCode}`);
  }

  return data;
}
