import Docker, { Container } from "dockerode";
import * as env from "../common/env";
import process from "node:process";
import chalk from "chalk";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { logGreen } from "../common/color";
import util from "node:util";
import { Transform } from "node:stream";
import os from "os";

type ContainerRunResponse = [{ StatusCode: number }, Container, id: string, Record<string, object>];

const docker = new Docker();

export function getLogFilePath(name: string) {
  const logsDir = `${process.cwd()}/logs`;
  mkdirSync(logsDir, { recursive: true });
  return `${logsDir}/${name.replace(/\W/g, "-")}.log`;
}

export function getStdout(name: string) {
  const logFilePath = getLogFilePath(name);
  logGreen(`Container log: ${logFilePath}`);
  return createWriteStream(logFilePath);
}

const PROGRESS_POLL_MS = 2_000;

function completeLines(logFilePath: string) {
  // drop the trailing partial line
  return readFileSync(logFilePath, "utf8").split("\n").slice(0, -1);
}

const MOCHA_PASSED_LINE = /^\s+[✔✓] /;
const MOCHA_FAILED_LINE = /^\s+\d+\) /;
const MOCHA_SUMMARY_LINE = /^\s+\d+ (passing|failing|pending)\b/;

/** `31 ✔ · 2 ✖` of a mocha run */
function mochaProgressOf(lines: string[]) {
  // failures are listed again after the summary
  const summaryStart = lines.findIndex((line) => MOCHA_SUMMARY_LINE.test(line));
  const results = summaryStart === -1 ? lines : lines.slice(0, summaryStart);
  const passed = results.filter((line) => MOCHA_PASSED_LINE.test(line)).length;
  const failed = results.filter((line) => MOCHA_FAILED_LINE.test(line)).length;
  return passed || failed ? `${passed} ✔ · ${failed} ✖` : "";
}

const FORGE_PASSED_LINE = /^\[PASS\] /;
const FORGE_FAILED_LINE = /^\[FAIL[:\]]/;
const FORGE_TOTAL_LINE = /^Ran \d+ test suites? in /;

/** `12 ✔ · 0 ✖` of a forge run */
function forgeProgressOf(lines: string[]) {
  // failures are listed again after the total
  const totalStart = lines.findIndex((line) => FORGE_TOTAL_LINE.test(line));
  const results = totalStart === -1 ? lines : lines.slice(0, totalStart);
  const passed = results.filter((line) => FORGE_PASSED_LINE.test(line)).length;
  const failed = results.filter((line) => FORGE_FAILED_LINE.test(line)).length;
  return passed || failed ? `${passed} ✔ · ${failed} ✖` : "";
}

/** `14% (50/351)` for pytest, `31 ✔ · 2 ✖` for mocha/forge, empty until the first result */
function progressOf(lines: string[]) {
  const collected = lines
    .map((line) => /^collected \d+ items?(?: \/ \d+ deselected \/ (\d+) selected)?/.exec(line))
    .find(Boolean);
  if (!collected) {
    return mochaProgressOf(lines) || forgeProgressOf(lines);
  }
  const total = Number(collected[1] ?? /^collected (\d+)/.exec(collected[0])?.[1]);
  // `tests/x.py ..F.  [ 14%]`, long files wrap onto bare `......` lines
  const resultLine = /^(\S+\.py )?([.FsxE]+)\s*(\[\s*\d+%\])?$/;
  const done = lines.reduce((count, line) => count + (resultLine.exec(line)?.[2].length ?? 0), 0);
  return `${Math.floor((done / total) * 100)}% (${done}/${total})`;
}

/** Prints the log progress when it changes; the returned callback stops it */
function followProgress(name: string, logFilePath: string) {
  let lastProgress = "";
  const tick = () => {
    const progress = progressOf(completeLines(logFilePath));
    if (progress && progress !== lastProgress) {
      lastProgress = progress;
      console.log(`[${name}] ${progress}`);
    }
  };
  const timer = setInterval(tick, PROGRESS_POLL_MS);
  return () => clearInterval(timer);
}

/** Mocha `N passing / N failing` lines and the failed test titles */
function summarizeMochaLog(lines: string[]) {
  const summaryStart = lines.findIndex((line) => MOCHA_SUMMARY_LINE.test(line));
  if (summaryStart === -1) {
    return null;
  }
  const summary = lines.slice(summaryStart);
  // `N) suite` line plus the test title on the next line
  const failures = summary.flatMap((line, index) =>
    MOCHA_FAILED_LINE.test(line) ? [line, summary[index + 1] ?? ""] : [],
  );
  return [...summary.filter((line) => MOCHA_SUMMARY_LINE.test(line)), ...failures].join("\n");
}

/** Forge `Ran N test suites …` line and the failed tests */
function summarizeForgeLog(lines: string[]) {
  const totalStart = lines.findIndex((line) => FORGE_TOTAL_LINE.test(line));
  if (totalStart === -1) {
    return null;
  }
  return lines
    .slice(totalStart)
    .filter((line) => FORGE_TOTAL_LINE.test(line) || FORGE_FAILED_LINE.test(line))
    .join("\n");
}

/** Test summary of a pytest, mocha or forge log; the tail of any other log */
export function summarizeLog(logFilePath: string, tailLines = 15) {
  const lines = completeLines(logFilePath);
  const summaryStart = lines.findIndex((line) => /^=+ short test summary info =+$/.test(line));
  if (summaryStart !== -1) {
    return lines.slice(summaryStart).join("\n");
  }
  const resultLine = lines.filter((line) => /^=+ .*\b(passed|failed|error)\b.* =+$/.test(line)).pop();
  return resultLine ?? summarizeMochaLog(lines) ?? summarizeForgeLog(lines) ?? lines.slice(-tailLines).join("\n");
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
    for await (const _chunk of readable) {
      // drain the stream
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

function isGitRefsResponse(obj: unknown): obj is GitRefsResponse {
  return typeof obj === "object" && obj !== null && "ref" in obj && "node_id" in obj && "url" in obj && "object" in obj;
}

const GIT_SHA_OVERRIDES: Record<Repos, () => string> = {
  scripts: env.GIT_SHA_SCRIPTS,
  core: env.GIT_SHA_CORE,
  "dual-governance": env.GIT_SHA_DG,
  depot: () => "",
};

async function getLastCommitSha(org: string, repo: Repos, branch: string) {
  const override = GIT_SHA_OVERRIDES[repo]?.();
  if (override) {
    return override;
  }

  const url = `https://api.github.com/repos/${org}/${repo}/git/refs/heads/${branch}`;
  const response = await fetch(url);
  const item = await response.json();

  if (!isGitRefsResponse(item)) {
    throw new Error(`Could not received a commit information for "${repo}": ${JSON.stringify(item)}`);
  }

  return item.object.sha;
}

async function getBuildVersion(org: string, repo: Repos, branch: string) {
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

function getTargetPlatformArgs(repo: Repos) {
  const override = env.IMAGE_PLATFORM(repo);
  const arch = override ? override.split("/")[1] : os.arch();

  // Convert Node.js arch to Docker arch
  const archMap: Record<string, string> = {
    x64: "amd64",
    arm64: "arm64",
    arm: "arm",
    ia32: "386",
  };
  const dockerArch = archMap[arch] || arch;

  return {
    TARGETARCH: dockerArch,
    TARGETPLATFORM: `linux/${dockerArch}`,
    BUILDPLATFORM: `linux/${dockerArch}`,
  };
}

export async function buildRepo(repo: Repos, branch: string, hideDebug: boolean): Promise<string> {
  const org = env.GITHUB_ORG();

  let buildVersion = "";

  try {
    buildVersion = await getBuildVersion(org, repo, branch);
  } catch (error) {
    console.error(`Error on retrieving build version: ${(error as Error).message}`);
  }

  const imageTag = `depot/${repo}:${buildVersion}`;

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

    const targetPlatformArgs = getTargetPlatformArgs(repo);

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
          SCRIPTS_IMAGE: env.SCRIPTS_IMAGE(),
        },
        platform: targetPlatformArgs.TARGETPLATFORM,
      },
    );

    const cleanStream = new Transform({
      transform(chunk, encoding, callback) {
        try {
          const streamLogRegExp = /{"stream":"(.*?)"}/i;
          const text = (chunk as Buffer).toString("utf8");
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

          streamValue = streamValue.replace(/\\u([0-9a-fA-F]{4})/g, (_match: string, hex: string) => {
            return String.fromCharCode(parseInt(hex, 16));
          });

          // Skip Docker headers if present
          if (streamValue.charCodeAt(0) <= 8) {
            streamValue = streamValue.slice(8); // Skip 8-byte Docker header
          }
          const cleaned = util.stripVTControlCharacters(streamValue);
          callback(null, cleaned);
        } catch (_error) {
          callback(null, chunk);
        }
      },
    });

    stream.pipe(cleanStream).pipe(stdout);

    const events = await new Promise<{ error?: string }[]>((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });
    const buildError = events.find((event) => event.error)?.error;
    if (buildError) {
      throw new Error(`Image ${imageTag} failed to build: ${buildError}`);
    }
  }

  return imageTag;
}

export function createCleanOutputStream(targetStream: NodeJS.WritableStream) {
  return new Transform({
    transform(chunk, encoding, callback) {
      const cleaned = util.stripVTControlCharacters((chunk as Buffer).toString("utf8"));

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
  instance = 0,
) {
  const docker = new Docker();

  const key = !instance ? repo : `${repo}-${instance}`;
  const name = `lido-${key}`;

  const logFilePath = getLogFilePath(name);
  const logFile = createWriteStream(logFilePath);
  // two streams make dockerode demux the docker frames
  const output = [createCleanOutputStream(logFile), createCleanOutputStream(logFile)];
  logGreen(`Container ${name} log: ${logFilePath}`);

  const container = await findContainerByName(name);

  if (container) {
    await stopContainer(container, name, true);
  }

  logGreen(`Running command on image ${imageTag} \n"${cmd.join(" ")}"`);
  const stopFollowing = followProgress(name, logFilePath);
  let data: ContainerRunResponse;
  try {
    data = await docker.run(imageTag, cmd, output, {
      Tty: false,
      name,
      platform: getTargetPlatformArgs(repo).TARGETPLATFORM,
      ...config,
      HostConfig: { AutoRemove: true, ExtraHosts: ["host.docker.internal:host-gateway"], ...config?.HostConfig },
    });
  } finally {
    stopFollowing();
    logFile.end();
  }

  const [statusInfo] = data;
  if (!statusInfo.hasOwnProperty?.("StatusCode")) {
    throw new Error(`Container ${name} stop working, but status code not found`);
  }
  const exitedCleanly = !statusInfo.StatusCode || statusInfo.StatusCode === 143;

  console.log(chalk.bold(`\n${exitedCleanly ? "✔" : "✖"} ${name} · ${cmd.join(" ")} · full log: ${logFilePath}`));
  console.log(summarizeLog(logFilePath));
  console.log();

  if (!exitedCleanly) {
    throw new Error(`Container ${name} exited with status code ${statusInfo.StatusCode}`);
  }

  return data;
}
