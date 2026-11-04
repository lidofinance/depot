import { fileURLToPath } from "node:url";
import { assert } from "chai";
import sinon from "sinon";
import { Abi } from "abitype";

import { deps, syncAbi } from "@/src/abi-sync";
import { deps as sourceDeps } from "@/src/abi-sync/abi-source";

const PROJECT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const ADDRESS = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const ABI: Abi = [
  {
    type: "function",
    name: "setManager",
    stateMutability: "nonpayable",
    inputs: [{ name: "manager_", type: "address" }],
    outputs: [],
  },
];

describe("syncAbi", () => {
  afterEach(() => sinon.restore());

  it("writes nothing when the formatter fails", async () => {
    sinon.stub(deps, "resolveAbi").resolves({ abi: ABI, contractName: "OracleRouter", source: "test" });
    const writeFile = sinon.stub(deps, "writeFile").resolves();
    sinon.stub(deps, "formatSolidity").rejects(new Error("forge fmt failed (Foundry must be installed)"));

    await assert.isRejected(
      syncAbi({ projectRoot: PROJECT_ROOT, name: "OracleRouter", networkName: "mainnet", address: ADDRESS }),
      /Foundry must be installed/,
    );
    assert.isFalse(writeFile.called);
  });

  it("rejects invalid local parameters before any write", async () => {
    sinon.stub(sourceDeps, "readFile").resolves(JSON.stringify([{ ...ABI[0], inputs: [{ name: "manager" }] }]));
    const writeFile = sinon.stub(deps, "writeFile").resolves();
    const formatSolidity = sinon.stub(deps, "formatSolidity").resolves("formatted");

    await assert.isRejected(
      syncAbi({ projectRoot: PROJECT_ROOT, name: "Invalid", networkName: "mainnet", fromFile: "Broken.json" }),
      /Broken\.json/,
    );
    assert.isFalse(writeFile.called);
    assert.isFalse(formatSolidity.called);
  });
});
