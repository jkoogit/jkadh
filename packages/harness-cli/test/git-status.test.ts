import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBranchStatusFromGit } from "../src/git/git-status.ts";

test("git status marks dev stg main aligned when remote refs match", () => {
  const status = buildBranchStatusFromGit({
    currentBranch: "task_codex/064-harness-cli-minimal",
    worktreePorcelain: "",
    remoteRefs: {
      main: "abc123",
      dev: "abc123",
      stg: "abc123"
    }
  });

  assert.equal(status.currentBranch, "task_codex/064-harness-cli-minimal");
  assert.equal(status.isAligned, true);
  assert.equal(status.worktreeStatus, "clean");
});

test("git status marks dirty worktree and unaligned remotes", () => {
  const status = buildBranchStatusFromGit({
    currentBranch: "main",
    worktreePorcelain: " M src/cli.ts",
    remoteRefs: {
      main: "abc123",
      dev: "def456",
      stg: "abc123"
    }
  });

  assert.equal(status.isAligned, false);
  assert.equal(status.worktreeStatus, "dirty");
});
