import Docker, { Container } from "dockerode";
import * as env from "../common/env";
import process from "node:process";
import chalk from "chalk";
import { createWriteStream } from "node:fs";
import { logGreen } from "../common/color";

export const RPC_NODE_SETTING: Record<string, { name: string; port: string; idx: number }> = {
  core: {
    name: "rpc-node-core",
    port: "18545",
    idx: 0,
  },
  depot: {
    name: "rpc-node-depot",
    port: "28545",
    idx: 1,
  },
  "dual-governance": {
    name: "rpc-node-dual-governance",
    port: "28545",
    idx: 2,
  },
  scripts: {
    name: "rpc-node-scripts",
    port: "38545",
    idx: 3,
  },
  "scripts-1": {
    name: "rpc-node-scripts-1",
    port: "48545",
    idx: 4,
  },
};

type ContainerRunResponse = [{ StatusCode: number }, Container, id: string, Record<string, {}>];

const docker = new Docker();

export function getStdout(name: string) {
  // FIXME: Fails when the logs folder does not exist
  const logFilePath = `${process.cwd()}/logs/${name.replace(/\W/g, "-")}.log`;
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
  imageName: string,
  cmd: string[],
  useOld = false,
  config?: Docker.ContainerCreateOptions,
) {
  logGreen(`Prepare container ${imageName} for run in background`);

  const containerOld = await findContainerByName(name);

  if (useOld && containerOld) {
    logGreen(`Previous hardhat-node container found and will be used`);
    return containerOld;
  }

  if (!useOld && containerOld) {
    logGreen(`Previous hardhat-node container found`);
    await stopContainer(containerOld, name, true);
  }

  const stdout = getStdout(name);

  const images = await docker.listImages();
  const image = images.find(({ RepoTags }) => RepoTags?.includes(imageName));

  if (!image) {
    logGreen(`Image for hardhat-node not found locally.`);
    logGreen(`Image pulling...`);
    const readable = await docker.pull(imageName);
    readable.setEncoding("utf8");
    let data = "";
    for await (const chunk of readable) {
      data += chunk;
    }
    // TODO: show logs based on settings
    // console.log(data);

    logGreen(`Image pulled...`);
  }

  // not working with await yet
  void docker.run(imageName, cmd, stdout, {
    Tty: false,
    name,
    ...config,
    HostConfig: { AutoRemove: true, ...config?.HostConfig },
  });
  logGreen(`Wait for ${name} container launch`);

  // TODO: add background run to hardhat container node instead
  await delay(2_000);

  const container = await findContainerByName(name);
  if (!container) {
    throw new Error(`Could not find container ${name}`);
  }
  const logs = await container.logs({ follow: true, stdout: true });

  logGreen(`Wait for ${name} container initiated`);
  const result = await Promise.race([delay(10_000), waitMessage(logs, "Started HTTP and WebSocket JSON-RPC server")]);

  console.log(result ? chalk.bold.green(result) : chalk.bold.red(`${name} container initiated timeout`));
  return result ? container : null;
}

export type Repos = "core" | "depot" | "scripts" | "dual-governance";

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

export async function getImageTag(org: string, repo: string, branch: string) {
  let buildVersion;
  if (branch) {
    const sha = await getLastCommitSha(org, repo, branch);
    buildVersion = sha?.slice(0, 7);
  } else {
    // TODO: ask about rebuild or verify changes somehow or mount local dir
    buildVersion = "latest";
  }

  return { imageTag: `depot/${repo}:${buildVersion}`, buildVersion };
}

export async function buildRepo(repo: string, branch: string, hideDebug: boolean) {
  const org = env.GITHUB_ORG();

  const { imageTag, buildVersion } = await getImageTag(org, repo, branch);

  const images = await docker.listImages();
  const image = images.find(({ RepoTags }) => RepoTags?.includes(imageTag));

  if (!image) {
    const stdout = hideDebug ? getStdout(imageTag) : process.stdout;

    console.log(`Image for ${repo} not found.`);
    console.log(`Creating image ${imageTag} to run fast next time`);
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
}

export async function runTestsFromRepo(
  repo: Repos,
  branch: string,
  cmd: string[],
  config: Docker.ContainerCreateOptions,
  hideDebug = false,
  instance = 0,
) {
  const docker = new Docker();
  const org = env.GITHUB_ORG();
  const { imageTag } = await getImageTag(org, repo, branch);

  const key = !instance ? repo : `${repo}-${instance}`;
  const name = `lido-${key}`;

  const stdout = hideDebug ? getStdout(name) : process.stdout;

  const container = await findContainerByName(name);

  if (container) {
    await stopContainer(container, name, true);
  }

  logGreen(`Running command on image ${imageTag} \n"${cmd.join(" ")}"`);
  const data: ContainerRunResponse = await docker.run(imageTag, cmd, stdout, {
    Tty: false,
    name,
    ...config,
    HostConfig: { AutoRemove: true, NetworkMode: `container:${RPC_NODE_SETTING[key].name}`, ...config?.HostConfig },
  });

  const [statusInfo] = data;

  if (!statusInfo.hasOwnProperty?.("StatusCode")) {
    throw new Error(`Container ${name} stop working, but status code not found`);
  }

  if (statusInfo?.StatusCode) {
    throw new Error(`Container ${name} stop working, with status code ${statusInfo.StatusCode}`);
  }

  return data;
}
