import Docker, { Container } from "dockerode";
import * as env from "../common/env";
import { errorMessage, KnownError } from "../common/errors";
import process from "node:process";
import chalk from "chalk";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { logGreen } from "../common/color";
import util from "node:util";
import { Transform } from "node:stream";
import { finished } from "node:stream/promises";
import os from "os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import * as ownedContainers from "./owned-containers";

type ContainerRunResponse = [{ StatusCode: number }, Container];

const docker = new Docker();

function getLogFilePath(name: string) {
  const logsDir = `${process.cwd()}/logs`;
  mkdirSync(logsDir, { recursive: true });
  return `${logsDir}/${name.replace(/\W/g, "-")}.log`;
}

function getStdout(name: string) {
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
const FORGE_SUITE_RESULT_LINE = /^\s*↪ Suite result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed;/;

/** `12 ✔ · 0 ✖` of a forge run */
function forgeProgressOf(lines: string[]) {
  // failures are listed again after the total
  const totalStart = lines.findIndex((line) => FORGE_TOTAL_LINE.test(line));
  const results = totalStart === -1 ? lines : lines.slice(0, totalStart);
  const summaries = results.map((line) => FORGE_SUITE_RESULT_LINE.exec(line)).filter((summary) => summary !== null);
  const passed = summaries.length
    ? summaries.reduce((count, summary) => count + Number(summary[1]), 0)
    : results.filter((line) => FORGE_PASSED_LINE.test(line)).length;
  const failed = summaries.length
    ? summaries.reduce((count, summary) => count + Number(summary[2]), 0)
    : results.filter((line) => FORGE_FAILED_LINE.test(line)).length;
  return passed || failed ? `${passed} ✔ · ${failed} ✖` : "";
}

/** `14% (50/351)` for pytest, `31 ✔ · 2 ✖` for mocha/forge, empty until the first result */
function progressOf(lines: string[]): string {
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
function summarizeLog(logFilePath: string, tailLines = 15) {
  const lines = completeLines(logFilePath);
  const summaryStart = lines.findIndex((line) => /^=+ short test summary info =+$/.test(line));
  if (summaryStart !== -1) {
    return lines.slice(summaryStart).join("\n");
  }
  const resultLine = lines.filter((line) => /^=+ .*\b(passed|failed|error)\b.* =+$/.test(line)).pop();
  return resultLine ?? summarizeMochaLog(lines) ?? summarizeForgeLog(lines) ?? lines.slice(-tailLines).join("\n");
}

/** Renames the container before stopping, so a new one can take the name right away */
export async function stopContainer(container: Container, name: string): Promise<void> {
  console.log(chalk.bold.green(`Stop container ${name} `));
  const tmpName = `${name}-rm-${Date.now()}`;
  console.log(chalk.bold.green(`Rename container ${name} to ${tmpName}`));
  await container.rename({ name: tmpName });
  await container.stop();
  ownedContainers.untrack(container);
}

export async function findContainerByName(name: string) {
  const containersInfo = await docker.listContainers();

  // docker prefixes names with a slash; a suffix match would also pick up `/other-project-${name}`
  const containerInfo = containersInfo.find(({ Names }) => Names?.includes(`/${name}`));
  return containerInfo ? docker.getContainer(containerInfo?.Id) : null;
}

// a Created or Exited container keeps its name, and `listContainers()` without `all` does not show it
async function removeStaleContainer(name: string): Promise<void> {
  const containersInfo = await docker.listContainers({ all: true });
  const staleInfo = containersInfo.find(({ Names, State }) => State !== "running" && Names?.includes(`/${name}`));
  if (staleInfo) {
    logGreen(`Remove stale container ${name} (${staleInfo.State})`);
    await docker.getContainer(staleInfo.Id).remove({ force: true });
  }
}

// the callback form of `docker.run` reports the container on creation, so a shutdown can stop it
function runOwnedContainer(
  image: string,
  cmd: string[],
  output: NodeJS.WritableStream | NodeJS.WritableStream[],
  options: Docker.ContainerCreateOptions,
): Promise<ContainerRunResponse> {
  return new Promise((resolve, reject) => {
    const settleCreate = ownedContainers.beginCreate();
    docker
      .run(
        image,
        cmd,
        output,
        options,
        {},
        (error: unknown, status?: { StatusCode: number }, container?: Container) => {
          if (container) {
            ownedContainers.untrack(container);
          }
          settleCreate();
          if (error || !status || !container) {
            reject(error ?? new Error(`Container ${String(options.name)} stop working, but status code not found`));
            return;
          }
          resolve([status, container]);
        },
      )
      .on("container", (container: Container) => {
        ownedContainers.track(container);
        settleCreate();
      });
  });
}

const delay = (ms: number) => new Promise<undefined>((resolve) => setTimeout(resolve, ms));
const waitMessage = async (logs: NodeJS.ReadableStream, msg: string) =>
  new Promise<string>((resolve) => {
    logs.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes(msg)) {
        resolve(msg);
      }
    });
  });

// Docker may need more than a fixed delay to create the container
async function waitForContainer(name: string): Promise<Container> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const container = await findContainerByName(name);
    if (container) {
      return container;
    }
    await delay(1_000);
  }
  throw new KnownError(`Container ${name} did not appear in 30s`);
}

export async function runImageInBackground(
  name: string,
  imageName: string,
  cmd: string[],
  config?: Docker.ContainerCreateOptions,
) {
  logGreen(`Prepare container ${imageName} for run in background`);
  await removeStaleContainer(name);

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

    logGreen(`Image pulled...`);
  }

  // the run settles only when the container exits, which before the node is ready is a failed launch
  const launchFailure = runOwnedContainer(imageName, cmd, stdout, {
    Tty: false,
    name,
    ...config,
    HostConfig: { AutoRemove: true, ...config?.HostConfig },
  }).then(
    ([status]) => Promise.reject(new KnownError(`Container ${name} exited with status ${status.StatusCode}`)),
    (error: unknown) => Promise.reject(new KnownError(`Container ${name} failed to run: ${errorMessage(error)}`)),
  );
  logGreen(`Wait for ${name} container launch`);

  const container = await Promise.race([waitForContainer(name), launchFailure]);
  const logs = await container.logs({ follow: true, stdout: true });

  logGreen(`Wait for ${name} container initiated`);
  const result = await Promise.race([
    delay(10_000),
    waitMessage(logs, "Started HTTP and WebSocket JSON-RPC server"),
    launchFailure,
  ]);

  console.log(result ? chalk.bold.green(result) : chalk.bold.red(`${name} container initiated timeout`));
  return container;
}

/** Repos with a regression suite, each built from its `tests@<repo>.Dockerfile` */
export type RepositorySuite = "core" | "scripts" | "dual-governance" | "staking-modules" | "stonks";

const GIT_SHA_OVERRIDES: Record<RepositorySuite, () => string> = {
  scripts: env.GIT_SHA_SCRIPTS,
  core: env.GIT_SHA_CORE,
  "dual-governance": env.GIT_SHA_DG,
  "staking-modules": env.GIT_SHA_STAKING_MODULES,
  stonks: env.GIT_SHA_STONKS,
};

const execFileAsync = util.promisify(execFile);
const LS_REMOTE_TIMEOUT_MS = 30_000;

async function lsRemote(url: string, ref: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["ls-remote", url, ref], {
    timeout: LS_REMOTE_TIMEOUT_MS,
    // a missing repo must fail instead of prompting for credentials
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout;
}

async function imageArchitecture(imageTag: string): Promise<string> {
  const { Architecture } = await docker.getImage(imageTag).inspect();
  return Architecture;
}

export const repoImageDeps = { lsRemote, imageArchitecture };

async function getLastCommitSha(org: string, repo: RepositorySuite, branch: string) {
  const url = `https://github.com/${org}/${repo}.git`;
  const ref = `refs/heads/${branch}`;
  let output: string;
  try {
    output = await repoImageDeps.lsRemote(url, ref);
  } catch (error) {
    // the repo is named outside the URL, which error output redacts
    throw new KnownError(`git ls-remote ${org}/${repo} ${ref} failed: ${errorMessage(error)}`);
  }

  const line = output.split("\n").find((entry) => entry.split("\t")[1] === ref);
  if (!line) {
    throw new KnownError(`Branch "${branch}" not found in ${org}/${repo}`);
  }
  return line.split("\t")[0];
}

function getTargetPlatformArgs(repo: RepositorySuite) {
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

const REVISION_LABEL = "org.opencontainers.image.revision";
const BUILD_INPUTS_LABEL = "finance.lido.depot.build-inputs";

/** The Dockerfile and the files it copies, sent as the build context */
function getBuildContextFiles(repo: RepositorySuite) {
  return [`tests@${repo}.Dockerfile`, ...(repo === "stonks" ? ["src/docker/stonks/hardhat.config.ts.template"] : [])];
}

/** Digest of everything depot feeds into the build besides the repo sources */
function hashBuildInputs(contextFiles: string[], buildArgs: Record<string, string>) {
  const hash = createHash("sha256");
  for (const file of contextFiles) {
    hash
      .update(`${file}\0`)
      .update(readFileSync(path.join(process.cwd(), file)))
      .update("\0");
  }
  hash.update(JSON.stringify(buildArgs));
  return hash.digest("hex").slice(0, 12);
}

interface RepoImage {
  repo: RepositorySuite;
  branch: string;
  sha: string;
  buildInputs: string;
  imageTag: string;
}

async function resolveRepoBuild(repo: RepositorySuite, branch: string) {
  const org = env.GITHUB_ORG();
  const sha = GIT_SHA_OVERRIDES[repo]() || (await getLastCommitSha(org, repo, branch));
  if (!/^[a-fA-F0-9]{40}$/.test(sha)) {
    throw new KnownError(`Expected a full commit SHA for "${repo}", received "${sha}"`);
  }
  const platformArgs = getTargetPlatformArgs(repo);
  const buildArgs: Record<string, string> = {
    ...platformArgs,
    GIT_SHA: sha,
    GITHUB_ORG: org,
    ...(repo === "scripts" ? { SCRIPTS_IMAGE: env.SCRIPTS_IMAGE() } : {}),
  };
  const contextFiles = getBuildContextFiles(repo);
  const buildInputs = hashBuildInputs(contextFiles, buildArgs);
  // the arch belongs in the tag: an image cached for another platform must not be reused
  const imageTag = `depot/${repo}:${sha.slice(0, 7)}-${buildInputs}-${platformArgs.TARGETARCH}`;
  const image: RepoImage = { repo, branch, sha, buildInputs, imageTag };
  return {
    image,
    org,
    buildArgs,
    contextFiles,
    platform: platformArgs.TARGETPLATFORM,
    arch: platformArgs.TARGETARCH,
  };
}

/** The commit an image is built from (`GIT_SHA_*` or the branch head), its build-inputs hash and cache tag */
export async function resolveRepoImage(repo: RepositorySuite, branch: string): Promise<RepoImage> {
  const { image } = await resolveRepoBuild(repo, branch);
  return image;
}

export async function buildRepo(repo: RepositorySuite, branch: string): Promise<string> {
  const { image, org, buildArgs, contextFiles, platform, arch } = await resolveRepoBuild(repo, branch);
  const { sha, buildInputs, imageTag } = image;
  console.log(`Repository ${org}/${repo}: ${branch} at ${sha}`);

  const images = await docker.listImages();
  // a short tag is not proof of what was built, the full labels are
  const cachedImage = images.find(
    ({ RepoTags, Labels }) =>
      RepoTags?.includes(imageTag) && Labels?.[REVISION_LABEL] === sha && Labels?.[BUILD_INPUTS_LABEL] === buildInputs,
  );

  if (!cachedImage) {
    const dockerfile = `tests@${repo}.Dockerfile`;
    console.log(`Building ${imageTag} for ${repo} (${platform})`);
    await buildImage(
      imageTag,
      { context: process.cwd(), src: contextFiles },
      {
        t: imageTag,
        dockerfile,
        buildargs: buildArgs,
        labels: { [BUILD_INPUTS_LABEL]: buildInputs },
        platform,
        // the classic builder ignores `platform` when the base image is local for the host arch
        version: "2",
      },
      buildCommandOf(dockerfile, platform, buildArgs),
    );
  }

  const builtArch = await repoImageDeps.imageArchitecture(imageTag);
  if (builtArch !== arch) {
    throw new KnownError(`Image ${imageTag} for ${repo} is ${builtArch}, expected ${arch}`);
  }

  return imageTag;
}

/** The CLI build that shows the full log of a failed `buildImage` */
function buildCommandOf(dockerfile: string, platform: string, buildArgs: Record<string, string>) {
  const args = Object.entries(buildArgs).map(([name, value]) => `--build-arg ${name}=${value}`);
  return ["docker buildx build --progress=plain", `--platform ${platform}`, `-f ${dockerfile}`, ...args, "."].join(" ");
}

async function buildImage(
  imageTag: string,
  context: Docker.ImageBuildContext,
  options: Docker.ImageBuildOptions,
  fullLogCommand: string,
) {
  const stream = await docker.buildImage(context, options);
  let buildError = "";
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (error, events) => (error ? reject(error) : resolve(events)),
      (event: { error?: string; errorDetail?: { message?: string } }) => {
        if (event.error) {
          buildError = event.errorDetail?.message ?? event.error;
        }
      },
    );
  });
  if (buildError) {
    throw new KnownError(`Image ${imageTag} failed to build: ${buildError}\nFull log: ${fullLogCommand}`);
  }
}

function createCleanOutputStream(targetStream: NodeJS.WritableStream) {
  return new Transform({
    transform(chunk, _encoding, callback) {
      const cleaned = util.stripVTControlCharacters((chunk as Buffer).toString("utf8"));

      if (cleaned) {
        targetStream.write(cleaned);
      }

      callback();
    },
  });
}

export async function runTestsFromRepo(
  repo: RepositorySuite,
  imageTag: string,
  cmd: string[],
  config: Docker.ContainerCreateOptions,
  instance = 0,
) {
  const key = !instance ? repo : `${repo}-${instance}`;
  const name = `lido-${key}`;

  const logFilePath = getLogFilePath(name);
  const logFile = createWriteStream(logFilePath);
  // two streams make dockerode demux the docker frames
  const output = [createCleanOutputStream(logFile), createCleanOutputStream(logFile)];
  logGreen(`Container ${name} log: ${logFilePath}`);

  const container = await findContainerByName(name);

  if (container) {
    await stopContainer(container, name);
  }
  await removeStaleContainer(name);

  logGreen(`Running command on image ${imageTag} \n"${cmd.join(" ")}"`);
  const stopFollowing = followProgress(name, logFilePath);
  let data: ContainerRunResponse;
  try {
    data = await runOwnedContainer(imageTag, cmd, output, {
      Tty: false,
      name,
      platform: getTargetPlatformArgs(repo).TARGETPLATFORM,
      ...config,
      HostConfig: { AutoRemove: true, ExtraHosts: ["host.docker.internal:host-gateway"], ...config?.HostConfig },
    });
  } finally {
    stopFollowing();
    logFile.end();
    await finished(logFile);
  }

  const [statusInfo] = data;
  const exitedCleanly = statusInfo.StatusCode === 0;

  console.log(chalk.bold(`\n${exitedCleanly ? "✔" : "✖"} ${name} · ${cmd.join(" ")} · full log: ${logFilePath}`));
  console.log(summarizeLog(logFilePath));
  console.log();

  if (!exitedCleanly) {
    throw new KnownError(`Container ${name} exited with status code ${statusInfo.StatusCode}`);
  }

  return data;
}
