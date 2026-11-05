import { assert } from "chai";
import Docker from "dockerode";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import sinon from "sinon";

import { buildRepo, repoImageDeps, resolveRepoImage } from "@/src/docker";

const SHA = "2824e21157bf13ef1c3c2c605ca54749270f4c35";
const ARCH = "amd64";
const REPOS = ["core", "dual-governance", "scripts", "staking-modules", "stonks"] as const;

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
    sinon.stub(repoImageDeps, "imageArchitecture").resolves(ARCH);
  });

  afterEach(() => {
    sinon.restore();
    process.env = originalEnv;
  });

  it("pins stonks to the full SHA resolved from its branch", async () => {
    lsRemoteStub.resolves(`${"f".repeat(40)}\trefs/heads/release-old\n${SHA}\trefs/heads/release\n`);

    const tag = await buildRepo("stonks", "release");

    const [, buildInputs] = new RegExp(`^depot/stonks:${SHA.slice(0, 7)}-([0-9a-f]{12})-${ARCH}$`).exec(tag) ?? [];
    assert.isDefined(buildInputs, tag);
    sinon.assert.calledOnceWithExactly(lsRemoteStub, "https://github.com/lidofinance/stonks.git", "refs/heads/release");
    sinon.assert.calledWithMatch(
      buildImageStub,
      { context: process.cwd(), src: ["tests@stonks.Dockerfile", "src/docker/stonks/hardhat.config.ts.template"] },
      { t: tag, buildargs: { GIT_SHA: SHA }, labels: { [BUILD_INPUTS_LABEL]: buildInputs } },
    );
  });

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
});
