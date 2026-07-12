import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTaskPromoteReport, executeTaskPromote, parseTaskPromoteArgs } from "../src/flows/task-promote.ts";

test("task promote arg parser accepts target commit branches and execution flag", () => {
  const input = parseTaskPromoteArgs([
    "--target-commit",
    "abc123",
    "--target-branches",
    "dev,stg",
    "--verification",
    "npm test passed",
    "--execute"
  ]);

  assert.deepEqual(input, {
    targetCommit: "abc123",
    targetBranches: ["dev", "stg"],
    verificationResult: "npm test passed",
    execution: {
      enabled: true
    }
  });
});

test("task promote report is ready when all target branches can fast-forward", () => {
  const report = buildTaskPromoteReport({
    targetCommit: "abc123",
    targetBranches: ["dev", "stg"],
    verificationResult: "npm test passed",
    branchStatus: [
      { branch: "dev", currentCommit: "base", targetCommit: "abc123", fastForward: true },
      { branch: "stg", currentCommit: "base", targetCommit: "abc123", fastForward: true }
    ]
  });

  assert.equal(report.status, "ready");
  assert.equal(report.json.promotionReady, true);
  assert.match(report.markdown, /branch readiness: dev: fast-forward/);
});

test("task promote report is blocked when a target branch cannot fast-forward", () => {
  const report = buildTaskPromoteReport({
    targetCommit: "abc123",
    targetBranches: ["dev", "stg"],
    verificationResult: "npm test passed",
    branchStatus: [
      { branch: "dev", currentCommit: "base", targetCommit: "abc123", fastForward: true },
      { branch: "stg", currentCommit: "other", targetCommit: "abc123", fastForward: false }
    ]
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.json.promotionReady, false);
  assert.match(report.markdown, /stg: blocked/);
});

test("task promote execution blocks when report is not ready", () => {
  const result = executeTaskPromote({
    targetBranches: ["dev"],
    verificationResult: "npm test passed",
    execution: {
      enabled: true
    },
    branchStatus: []
  }, "repo");

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /task promote report is not ready/);
});

test("task promote execution pushes target commit to target branches", () => {
  const calls: string[] = [];
  const result = executeTaskPromote({
    targetCommit: "abc123",
    targetBranches: ["dev", "stg"],
    verificationResult: "npm test passed",
    execution: {
      enabled: true
    },
    branchStatus: [
      { branch: "dev", currentCommit: "base", targetCommit: "abc123", fastForward: true },
      { branch: "stg", currentCommit: "base", targetCommit: "abc123", fastForward: true }
    ]
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.deepEqual(calls, [
    "git push origin abc123:refs/heads/dev",
    "git push origin abc123:refs/heads/stg"
  ]);
});
