import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveRepositoryRoot } from "../src/git/repo-root.ts";

test("repository root resolver uses git top-level from package subdirectories", () => {
  const calls: string[] = [];
  const root = resolveRepositoryRoot("D:/repo/packages/harness-cli", {
    run(cwd) {
      calls.push(cwd);
      return "D:/repo";
    }
  });

  assert.equal(root, "D:/repo");
  assert.deepEqual(calls, ["D:/repo/packages/harness-cli"]);
});

test("repository root resolver falls back to cwd outside git", () => {
  assert.equal(resolveRepositoryRoot("D:/standalone", {
    run() {
      throw new Error("not a repository");
    }
  }), "D:/standalone");
});
