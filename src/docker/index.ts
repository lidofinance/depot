import Docker, { Container } from "dockerode";
import * as env from "../common/env";
import process from "node:process";
import chalk from "chalk";
import { createWriteStream } from "node:fs";
import { logGreen } from "../common/color";
import util from "node:util";
import { Transform } from "node:stream";
import os from "os";

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

interface GitRefsResponse {
  ref: string;
  node_id: string;
  url: string;
  object: {
    sha: string;
    type: string;
    url: string;
  };
}

function isGitRefsResponse(obj: any): obj is GitRefsResponse {
  return "ref" in obj && "node_id" in obj && "url" in obj && "object" in obj;
}

async function getLastCommitSha(org: string, repo: string, branch: string) {
  const url = `https://api.github.com/repos/${org}/${repo}/git/refs/heads/${branch}`;
  const response = await fetch(url);
  const item = await response.json();

  if (!isGitRefsResponse(item)) {
    throw new Error(`Could not received a commit information for "${repo}": ${JSON.stringify(item)}`);
  }

  return item.object.sha;
}

async function getBuildVersion(org: string, repo: string, branch: string) {
  let buildVersion = "";
  if (branch) {
    const sha = await getLastCommitSha(org, repo, branch);
    buildVersion = sha?.slice(0, 7);
  } else {
    // TODO: ask about rebuild or verify changes somehow or mount local dir
    buildVersion = "latest";
  }
  return buildVersion;
}

function getTargetPlatformArgs() {
  const arch = os.arch();

  // Convert Node.js arch to Docker arch
  const dockerArch =
    {
      x64: "amd64",
      arm64: "arm64",
      arm: "arm",
      ia32: "386",
    }[arch] || arch;

  return {
    TARGETARCH: dockerArch,
    TARGETPLATFORM: `linux/${dockerArch}`,
    BUILDPLATFORM: `linux/${dockerArch}`,
  };
}

export async function buildRepo(repo: string, branch: string, hideDebug: boolean): Promise<string> {
  const org = env.GITHUB_ORG();

  let buildVersion = "";

  try {
    buildVersion = await getBuildVersion(org, repo, branch);
  } catch (error) {
    console.error(`Error on retrieving build version: ${(error as Error).message}`);
  }

  let imageTag = `depot/${repo}:${buildVersion}`;

  const image = await docker.listImages().then(
    (images) =>
      images
        // when the tag can't be received, take the latest one
        .filter(({ RepoTags }) => RepoTags?.some((tag) => tag.startsWith(imageTag)))
        // the last at the top
        .sort((i1, i2) => i2.Created - i1.Created)[0],
  );

  if (!buildVersion && !image.RepoTags?.includes(imageTag)) {
    const actualRepoTag = image.RepoTags?.find((rt) => rt.startsWith(imageTag));
    console.log(
      chalk.yellow.bold(
        `IMPORTANT: The build version for the repo "${repo}" is not set. Will be used tag ${actualRepoTag} `,
      ),
    );
    return actualRepoTag!;
  }

  // the buildVersion was resolved but there is not image with such tag => it should be built
  if (!!buildVersion && !image) {
    const stdout = hideDebug ? getStdout(imageTag) : process.stdout;

    const targetPlatformArgs = getTargetPlatformArgs();

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
        buildargs: {
          ...targetPlatformArgs,
          GIT_BRANCH: branch,
          BUILD_VERSION: buildVersion,
          GITHUB_ORG: org,
        },
        platform: "linux/arm64",
      },
    );

    const cleanStream = new Transform({
      transform(chunk, encoding, callback) {
        try {
          const streamLogRegExp = /{"stream":"(.*?)"}/i;
          const text = chunk.toString("utf8");
          const match = streamLogRegExp.exec(text) || [];

          if (!match) {
            throw new Error(`Unexpected format`);
          }

          let streamValue = match[1];

          streamValue = streamValue
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");

          streamValue = streamValue.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
          });

          // Skip Docker headers if present
          if (streamValue.charCodeAt(0) <= 8) {
            streamValue = streamValue.slice(8); // Skip 8-byte Docker header
          }
          const cleaned = util.stripVTControlCharacters(streamValue);
          callback(null, cleaned);
        } catch (error) {
          callback(null, chunk);
        }
      },
    });

    stream.pipe(cleanStream).pipe(stdout);

    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });
  }

  return imageTag;
}

export function createCleanOutputStream(targetStream: NodeJS.WritableStream) {
  return new Transform({
    transform(chunk, encoding, callback) {
      let text = chunk.toString("utf8");

      // Skip Docker headers if present
      if (text.charCodeAt(0) <= 8) {
        text = text.slice(8); // Skip 8-byte Docker header
      }

      const cleaned = util.stripVTControlCharacters(text);

      if (cleaned) {
        targetStream.write(cleaned);
      }

      callback();
    },
  });
}

export async function runTestsFromRepo(
  repo: Repos,
  imageTag: string,
  cmd: string[],
  config: Docker.ContainerCreateOptions,
  hideDebug = false,
  instance = 0,
) {
  const docker = new Docker();

  const key = !instance ? repo : `${repo}-${instance}`;
  const name = `lido-${key}`;

  const stdout = createCleanOutputStream(hideDebug ? getStdout(name) : process.stdout);

  const container = await findContainerByName(name);

  if (container) {
    await stopContainer(container, name, true);
  }

  logGreen(`Running command on image ${imageTag} \n"${cmd.join(" ")}"`);
  const data: ContainerRunResponse = await docker.run(imageTag, cmd, stdout, {
    Tty: false,
    name,
    ...config,
    HostConfig: { AutoRemove: true, ExtraHosts: ["host.docker.internal:host-gateway"], ...config?.HostConfig },
  });

  const [statusInfo] = data;

  if (!statusInfo.hasOwnProperty?.("StatusCode")) {
    throw new Error(`Container ${name} stop working, but status code not found`);
  }

  if (statusInfo?.StatusCode && statusInfo?.StatusCode !== 143) {
    throw new Error(`Container ${name} stop working, with status code ${statusInfo.StatusCode}`);
  }

  return data;
}
