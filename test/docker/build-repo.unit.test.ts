import { assert } from "chai";
import Docker from "dockerode";
import { Readable } from "node:stream";
import sinon from "sinon";

import { buildRepo } from "../../src/docker";

const SHA = "2824e21157bf13ef1c3c2c605ca54749270f4c35";
const ARCH = "amd64";

function cachedImage(repo: string, revision: string, arch = ARCH): Docker.ImageInfo {
  return {
    Id: "cached-image",
    ParentId: "",
    RepoTags: [`depot/${repo}:${SHA.slice(0, 7)}-${arch}`],
    Created: 1,
    Size: 0,
    VirtualSize: 0,
    SharedSize: 0,
    Labels: { "org.opencontainers.image.revision": revision },
    Containers: 0,
  };
}

describe("repository image builds", () => {
  const originalEnv = process.env;
  let fetchStub: sinon.SinonStub<Parameters<typeof fetch>, ReturnType<typeof fetch>>;
  let imagesStub: sinon.SinonStub<Parameters<Docker["listImages"]>, ReturnType<Docker["listImages"]>>;
  let buildImageStub: sinon.SinonStub<Parameters<Docker["buildImage"]>, ReturnType<Docker["buildImage"]>>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITHUB_ORG: "lidofinance",
      GIT_SHA_STAKING_MODULES: "",
      GIT_SHA_STONKS: "",
      // pin the platform so the tag under test does not depend on the host arch
      IMAGE_PLATFORM_STAKING_MODULES: `linux/${ARCH}`,
      IMAGE_PLATFORM_STONKS: `linux/${ARCH}`,
    };
    sinon.stub(console, "log");
    imagesStub = sinon.stub(Docker.prototype, "listImages").resolves([]);
    buildImageStub = sinon.stub(Docker.prototype, "buildImage").callsFake(() => Promise.resolve(Readable.from([])));
    fetchStub = sinon.stub(globalThis, "fetch").rejects(new Error("Unexpected network call"));
  });

  afterEach(() => {
    sinon.restore();
    process.env = originalEnv;
  });

  for (const repo of ["staking-modules", "stonks"] as const) {
    it(`pins ${repo} to the full SHA resolved from its branch`, async () => {
      fetchStub.resolves(
        new Response(
          JSON.stringify({
            ref: "refs/heads/release",
            node_id: "ref",
            url: "https://example.com",
            object: { sha: SHA },
          }),
        ),
      );

      const tag = await buildRepo(repo, "release", false);

      assert.equal(tag, `depot/${repo}:${SHA.slice(0, 7)}-${ARCH}`);
      sinon.assert.calledOnceWithExactly(
        fetchStub,
        `https://api.github.com/repos/lidofinance/${repo}/git/refs/heads/release`,
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
        { buildargs: { GIT_SHA: SHA, GIT_BRANCH: "release" } },
      );
    });

    it(`uses the ${repo} SHA override without resolving a moving branch`, async () => {
      process.env[`GIT_SHA_${repo.toUpperCase().replace(/-/g, "_")}`] = SHA;

      await buildRepo(repo, "release", false);

      sinon.assert.notCalled(fetchStub);
      sinon.assert.calledWithMatch(buildImageStub, sinon.match.any, {
        buildargs: { GIT_SHA: SHA },
      });
    });
  }

  it("reuses an image only when its recorded full revision matches", async () => {
    process.env.GIT_SHA_STAKING_MODULES = SHA;
    const images = imagesStub;
    images.resolves([cachedImage("staking-modules", "different-revision")]);

    await buildRepo("staking-modules", "develop", false);
    sinon.assert.calledOnce(buildImageStub);

    buildImageStub.resetHistory();
    images.resolves([cachedImage("staking-modules", SHA)]);
    await buildRepo("staking-modules", "develop", false);
    sinon.assert.notCalled(buildImageStub);
  });

  it("rebuilds instead of reusing an image cached for another architecture", async () => {
    process.env.GIT_SHA_STAKING_MODULES = SHA;
    imagesStub.resolves([cachedImage("staking-modules", SHA, "arm64")]);

    await buildRepo("staking-modules", "develop", false);

    sinon.assert.calledOnce(buildImageStub);
  });

  it("propagates a ref lookup failure without falling back to a cached image", async () => {
    const lookupError = new Error("GitHub unavailable");
    fetchStub.rejects(lookupError);
    let thrown: unknown;
    try {
      await buildRepo("staking-modules", "develop", false);
    } catch (error) {
      thrown = error;
    }
    assert.strictEqual(thrown, lookupError);
    sinon.assert.notCalled(imagesStub);
  });

  it("rejects a shortened SHA before building", async () => {
    process.env.GIT_SHA_STONKS = SHA.slice(0, 7);
    let thrown: unknown;
    try {
      await buildRepo("stonks", "main", false);
    } catch (error) {
      thrown = error;
    }
    assert.instanceOf(thrown, Error);
    assert.include(String(thrown), "Expected a full commit SHA");
    sinon.assert.notCalled(buildImageStub);
  });
});
