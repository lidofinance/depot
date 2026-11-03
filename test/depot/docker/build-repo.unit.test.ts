import { assert } from "chai";
import Docker from "dockerode";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import sinon from "sinon";

import { errorMessage } from "@/src/common/errors";
import { buildRepo, repoImageDeps, resolveRepoImage } from "@/src/docker";

const SHA = "2824e21157bf13ef1c3c2c605ca54749270f4c35";
const ARCH = "amd64";
const REPOS = ["core", "dual-governance", "scripts", "staking-modules", "stonks"] as const;
// an empty GIT_SHA_DG falls back to the DG pin, so DG never resolves its branch
const BRANCH_REPOS = REPOS.filter((repo) => repo !== "dual-governance");
const DG_PIN = "cc407b472199585b21d33b14c6b3067a6b62de96";

const BUILD_INPUTS_LABEL = "finance.lido.depot.build-inputs";

const upperSnake = (repo: string) => repo.toUpperCase().replace(/-/g, "_");
const envSuffix = (repo: (typeof REPOS)[number]) => (repo === "dual-governance" ? "DG" : upperSnake(repo));

function cachedImage(imageTag: string, revision: string, buildInputs: string): Docker.ImageInfo {
  return {
    Id: "cached-image",
    ParentId: "",
    RepoTags: [imageTag],
    Created: 1,
    Size: 0,
    VirtualSize: 0,
    SharedSize: 0,
    Labels: { "org.opencontainers.image.revision": revision, [BUILD_INPUTS_LABEL]: buildInputs },
    Containers: 0,
  };
}

describe("repository image builds", () => {
  const originalEnv = process.env;
  let lsRemoteStub: sinon.SinonStub<
    Parameters<typeof repoImageDeps.lsRemote>,
    ReturnType<typeof repoImageDeps.lsRemote>
  >;
  let imageArchitectureStub: sinon.SinonStub<
    Parameters<typeof repoImageDeps.imageArchitecture>,
    ReturnType<typeof repoImageDeps.imageArchitecture>
  >;
  let imagesStub: sinon.SinonStub<Parameters<Docker["listImages"]>, ReturnType<Docker["listImages"]>>;
  let buildImageStub: sinon.SinonStub<Parameters<Docker["buildImage"]>, ReturnType<Docker["buildImage"]>>;

  beforeEach(() => {
    process.env = { ...originalEnv, GITHUB_ORG: "lidofinance" };
    for (const repo of REPOS) {
      process.env[`GIT_SHA_${envSuffix(repo)}`] = "";
      // pin the platform so the tag under test does not depend on the host arch
      process.env[`IMAGE_PLATFORM_${upperSnake(repo)}`] = `linux/${ARCH}`;
    }
    sinon.stub(console, "log");
    imagesStub = sinon.stub(Docker.prototype, "listImages").resolves([]);
    buildImageStub = sinon.stub(Docker.prototype, "buildImage").callsFake(() => Promise.resolve(Readable.from([])));
    lsRemoteStub = sinon.stub(repoImageDeps, "lsRemote").rejects(new Error("Unexpected network call"));
    imageArchitectureStub = sinon.stub(repoImageDeps, "imageArchitecture").resolves(ARCH);
  });

  afterEach(() => {
    sinon.restore();
    process.env = originalEnv;
  });

  for (const repo of BRANCH_REPOS) {
    it(`pins ${repo} to the full SHA resolved from its branch`, async () => {
      lsRemoteStub.resolves(`${"f".repeat(40)}\trefs/heads/release-old\n${SHA}\trefs/heads/release\n`);

      const tag = await buildRepo(repo, "release");

      const [, buildInputs] = new RegExp(`^depot/${repo}:${SHA.slice(0, 7)}-([0-9a-f]{12})-${ARCH}$`).exec(tag) ?? [];
      assert.isDefined(buildInputs, tag);
      sinon.assert.calledOnceWithExactly(
        lsRemoteStub,
        `https://github.com/lidofinance/${repo}.git`,
        "refs/heads/release",
      );
      sinon.assert.calledWithMatch(
        buildImageStub,
        {
          context: process.cwd(),
          src: [
            `tests@${repo}.Dockerfile`,
            ...(repo === "stonks" ? ["src/docker/stonks/hardhat.config.ts.template"] : []),
          ],
        },
        { t: tag, buildargs: { GIT_SHA: SHA }, labels: { [BUILD_INPUTS_LABEL]: buildInputs } },
      );
    });
  }

  it("pins dual-governance to its default commit without resolving the branch", async () => {
    const tag = await buildRepo("dual-governance", "develop");

    assert.match(tag, new RegExp(`^depot/dual-governance:${DG_PIN.slice(0, 7)}-[0-9a-f]{12}-${ARCH}$`));
    sinon.assert.notCalled(lsRemoteStub);
    sinon.assert.calledWithMatch(buildImageStub, sinon.match.any, { buildargs: { GIT_SHA: DG_PIN } });
  });

  for (const repo of REPOS) {
    it(`uses the ${repo} SHA override without resolving a moving branch`, async () => {
      process.env[`GIT_SHA_${envSuffix(repo)}`] = SHA;

      await buildRepo(repo, "release");

      sinon.assert.notCalled(lsRemoteStub);
      sinon.assert.calledWithMatch(buildImageStub, sinon.match.any, {
        buildargs: { GIT_SHA: SHA },
      });
    });
  }

  it("reuses an image only when its recorded revision and build inputs match", async () => {
    process.env.GIT_SHA_STAKING_MODULES = SHA;
    const { imageTag, buildInputs } = await resolveRepoImage("staking-modules", "develop");

    for (const [revision, inputs] of [
      ["different-revision", buildInputs],
      [SHA, "different-inputs"],
    ]) {
      buildImageStub.resetHistory();
      imagesStub.resolves([cachedImage(imageTag, revision, inputs)]);
      await buildRepo("staking-modules", "develop");
      sinon.assert.calledOnce(buildImageStub);
    }

    buildImageStub.resetHistory();
    imagesStub.resolves([cachedImage(imageTag, SHA, buildInputs)]);
    await buildRepo("staking-modules", "develop");
    sinon.assert.notCalled(buildImageStub);
  });

  it("rebuilds instead of reusing an image cached for another architecture", async () => {
    process.env.GIT_SHA_STAKING_MODULES = SHA;
    const { imageTag, buildInputs } = await resolveRepoImage("staking-modules", "develop");
    imagesStub.resolves([cachedImage(imageTag.replace(`-${ARCH}`, "-arm64"), SHA, buildInputs)]);

    await buildRepo("staking-modules", "develop");

    sinon.assert.calledOnce(buildImageStub);
  });

  it("builds with BuildKit, which honours the requested platform", async () => {
    process.env.GIT_SHA_CORE = SHA;

    await buildRepo("core", "develop");

    sinon.assert.calledWithMatch(buildImageStub, sinon.match.any, { platform: `linux/${ARCH}`, version: "2" });
  });

  it("fails with the build error and the command that shows the full log", async () => {
    process.env.GIT_SHA_CORE = SHA;
    const { imageTag } = await resolveRepoImage("core", "develop");
    const failedStep = 'process "/bin/sh -c exit 7" did not complete successfully: exit code: 7';
    buildImageStub.callsFake(() =>
      Promise.resolve(
        Readable.from([
          Buffer.from(`${JSON.stringify({ error: failedStep, errorDetail: { message: failedStep } })}\n`),
        ]),
      ),
    );
    let thrown: unknown;
    try {
      await buildRepo("core", "develop");
    } catch (error) {
      thrown = error;
    }
    assert.include(errorMessage(thrown), `Image ${imageTag} failed to build: ${failedStep}`);
    assert.include(
      errorMessage(thrown),
      `Full log: docker buildx build --progress=plain --platform linux/${ARCH} -f tests@core.Dockerfile`,
    );
    assert.include(errorMessage(thrown), `--build-arg GIT_SHA=${SHA}`);
    sinon.assert.notCalled(imageArchitectureStub);
  });

  for (const cached of [false, true]) {
    it(`fails when the ${cached ? "cached" : "built"} image has another architecture`, async () => {
      process.env.GIT_SHA_CORE = SHA;
      const { imageTag, buildInputs } = await resolveRepoImage("core", "develop");
      if (cached) {
        imagesStub.resolves([cachedImage(imageTag, SHA, buildInputs)]);
      }
      imageArchitectureStub.resolves("arm64");
      let thrown: unknown;
      try {
        await buildRepo("core", "develop");
      } catch (error) {
        thrown = error;
      }
      assert.include(errorMessage(thrown), `Image ${imageTag} for core is arm64, expected ${ARCH}`);
      sinon.assert.calledOnceWithExactly(imageArchitectureStub, imageTag);
      sinon.assert.callCount(buildImageStub, cached ? 0 : 1);
    });
  }

  it("changes the image tag with the Dockerfile and the base image of scripts", async () => {
    process.env.GIT_SHA_SCRIPTS = SHA;
    const dockerfile = "tests@scripts.Dockerfile";
    const contextDir = mkdtempSync(path.join(os.tmpdir(), "depot-build-inputs-"));
    copyFileSync(path.join(process.cwd(), dockerfile), path.join(contextDir, dockerfile));
    sinon.stub(process, "cwd").returns(contextDir);
    try {
      const original = await resolveRepoImage("scripts", "master");

      writeFileSync(path.join(contextDir, dockerfile), "FROM scratch\n");
      const editedDockerfile = await resolveRepoImage("scripts", "master");

      process.env.SCRIPTS_IMAGE = "ghcr.io/lidofinance/scripts:v23";
      const otherBaseImage = await resolveRepoImage("scripts", "master");

      assert.notEqual(editedDockerfile.imageTag, original.imageTag);
      assert.notEqual(otherBaseImage.imageTag, editedDockerfile.imageTag);
    } finally {
      rmSync(contextDir, { recursive: true, force: true });
    }
  });

  for (const repo of BRANCH_REPOS) {
    it(`propagates a ${repo} ref lookup failure without falling back to a cached image`, async () => {
      lsRemoteStub.rejects(new Error("GitHub unavailable"));
      let thrown: unknown;
      try {
        await buildRepo(repo, "develop");
      } catch (error) {
        thrown = error;
      }
      assert.include(errorMessage(thrown), "git ls-remote");
      assert.include(errorMessage(thrown), "GitHub unavailable");
      sinon.assert.notCalled(imagesStub);
    });
  }

  it("fails when the branch is missing from the remote", async () => {
    lsRemoteStub.resolves("");
    let thrown: unknown;
    try {
      await buildRepo("core", "no-such-branch");
    } catch (error) {
      thrown = error;
    }
    assert.include(errorMessage(thrown), 'Branch "no-such-branch" not found');
    sinon.assert.notCalled(buildImageStub);
  });

  it("rejects a shortened SHA before building", async () => {
    process.env.GIT_SHA_STONKS = SHA.slice(0, 7);
    let thrown: unknown;
    try {
      await buildRepo("stonks", "main");
    } catch (error) {
      thrown = error;
    }
    assert.instanceOf(thrown, Error);
    assert.include(String(thrown), "Expected a full commit SHA");
    sinon.assert.notCalled(buildImageStub);
  });
});
