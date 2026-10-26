import { assert } from "chai";

import { progressOf } from "../../src/docker";

describe("container test progress", () => {
  it("reports progress from the staking-modules log even though individual results are hidden", () => {
    assert.equal(
      progressOf([
        "test/fork/integration/common/AccountingExtras.t.sol:AccountingExtrasTestCSM",
        "  ↪ Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 74.66s (23.51s CPU time)",
        "test/fork/integration/common/AccountingExtras.t.sol:AccountingExtrasTestCSM0x02",
        "  ↪ Suite result: ok. 0 passed; 0 failed; 1 skipped; finished in 2.03s (0.00ns CPU time)",
      ]),
      "4 ✔ · 0 ✖",
    );
  });

  it("counts Forge show-progress suite results", () => {
    assert.equal(
      progressOf([
        "  ↪ Suite result: ok. 4 passed; 0 failed; 1 skipped; finished in 1s",
        "  ↪ Suite result: FAILED. 2 passed; 1 failed; 0 skipped; finished in 1s",
      ]),
      "6 ✔ · 1 ✖",
    );
  });

  it("does not double-count ordinary Forge results or the repeated failure list", () => {
    assert.equal(
      progressOf([
        "[PASS] test_happyPath()",
        "[FAIL: regression] test_errorPath()",
        "Suite result: FAILED. 1 passed; 1 failed; 0 skipped; finished in 1s",
        "Ran 1 test suite in 1s: 1 tests passed, 1 failed, 0 skipped (2 total tests)",
        "[FAIL: regression] test_errorPath()",
      ]),
      "1 ✔ · 1 ✖",
    );
  });

  it("keeps show-progress totals when individual results and unprefixed summaries arrive", () => {
    const lines = [
      "  ↪ Suite result: ok. 4 passed; 0 failed; 1 skipped; finished in 1s",
      "  ↪ Suite result: FAILED. 2 passed; 1 failed; 0 skipped; finished in 1s",
    ];
    assert.equal(progressOf(lines), "6 ✔ · 1 ✖");

    for (const line of [
      "[PASS] test_happyPath()",
      "Suite result: ok. 4 passed; 0 failed; 1 skipped; finished in 1s",
      "[FAIL: regression] test_errorPath()",
      "Suite result: FAILED. 2 passed; 1 failed; 0 skipped; finished in 1s",
      "Ran 2 test suites in 1s: 6 tests passed, 1 failed, 1 skipped (8 total tests)",
      "[FAIL: regression] test_errorPath()",
    ]) {
      lines.push(line);
      assert.equal(progressOf(lines), "6 ✔ · 1 ✖");
    }
  });
});
