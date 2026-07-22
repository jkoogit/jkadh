import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTaskProcessReport, parseTaskProcessArgs } from "../src/flows/task-process.ts";

test("task process parser accepts HCP selectors and execution mode", () => {
  assert.deepEqual(parseTaskProcessArgs([
    "--session-id", "codex_ses_018_001",
    "--task-id", "codex_task_018_001",
    "--scope", "policy registry",
    "--execute"
  ]), {
    sessionId: "codex_ses_018_001",
    taskId: "codex_task_018_001",
    scope: "policy registry",
    execution: { enabled: true }
  });
});

test("task process is ready only for one active task on its registered branch", () => {
  const report = buildTaskProcessReport({
    activeSession: true,
    activeTask: true,
    currentBranch: "task_codex/122-policy",
    registeredBranch: "task_codex/122-policy",
    scope: "policy registry"
  });

  assert.equal(report.status, "ready");
  assert.equal(report.json.policyResults.every((result) => result.status === "pass"), true);
  assert.ok(report.blockedActions.includes("commit_changes"));
});

test("task process blocks before task start or on a mismatched branch", () => {
  const report = buildTaskProcessReport({
    activeSession: true,
    activeTask: false,
    currentBranch: "main",
    registeredBranch: undefined,
    scope: undefined
  });

  assert.equal(report.status, "blocked");
  assert.match(report.markdown, /task-process.active-task=blocked/);
  assert.match(report.markdown, /task-process.branch=blocked/);
  assert.match(report.markdown, /task-process.scope=blocked/);
});
