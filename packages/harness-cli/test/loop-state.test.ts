import assert from "node:assert/strict";
import { existsSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

import { approveLoopCondition, beginLoopWorkItemImplementation, buildRollbackReport, completeLoopWorkItemImplementation, createLoopCheckpoint, createLoopRun, executeApprovedRollback, listLoopRuns, recoverStaleLoopLeases, restoreLoop, reviseLoopAnalysis, runNextLoopWorkItem, selectLoopCandidates, softDeleteLoop, transitionLoop, validateWorkItems } from "../src/state/loop-state.ts";

const workItems = [{
  id: "work_001", title: "foundation", dependencies: [], completionConditions: ["tests pass"],
  expectedResults: ["completed_changed", "completed_no_change"], errorCases: ["verification_failed"],
  allowedPaths: ["packages/harness-cli/**"], verificationCommands: ["npm test"]
}];

test("loop analysis validates completion results errors and dependency cycles", () => {
  assert.deepEqual(validateWorkItems(workItems), []);
  assert.match(validateWorkItems([{ ...workItems[0], dependencies: ["work_001"] }]).join(";"), /cycle/);
  assert.match(validateWorkItems([{ ...workItems[0], completionConditions: [] }]).join(";"), /completion/);
});

test("loop analysis derives initial readiness from dependencies rather than registry order", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-order-"));
  const items = [
    { ...workItems[0], id: "work_002", dependencies: ["work_001"] },
    { ...workItems[0], id: "work_001", dependencies: [] },
    { ...workItems[0], id: "work_003", dependencies: [] }
  ];
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems: items });
  assert.equal(loop.workItems.find((item) => item.id === "work_002")?.status, "pending");
  assert.equal(loop.workItems.find((item) => item.id === "work_001")?.status, "ready");
  assert.equal(loop.workItems.find((item) => item.id === "work_003")?.status, "ready");
});

test("loop run is task scoped and supports candidate selection soft delete and restore", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-"));
  const loop = createLoopRun(repo, {
    sessionId: "codex_ses_018_001", taskId: "codex_task_018_001", title: "loop", objective: "implement", workItems,
    now: new Date("2026-07-21T00:00:00.000Z")
  });
  assert.equal(loop.status, "analysis_ready");
  assert.equal(selectLoopCandidates(repo, "execute", loop.taskId).length, 1);
  transitionLoop(repo, loop.loopId, "paused");
  softDeleteLoop(repo, loop.loopId, "obsolete");
  assert.equal(listLoopRuns(repo, loop.taskId, true).find((item) => item.loopId === loop.loopId)?.status, "deleted");
  assert.equal(restoreLoop(repo, loop.loopId).status, "paused");
});

test("loop checkpoint captures branch commit files and diff digest", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-git-"));
  execFileSync("git", ["init"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repo });
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems });
  const checkpoint = createLoopCheckpoint(repo, loop.loopId, "before");
  assert.ok(checkpoint.baseCommit);
  assert.equal(checkpoint.diffDigest.length, 64);
});

test("loop execution verifies ready work item and completes the loop", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-execute-"));
  execFileSync("git", ["init"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repo });
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems: [{ ...workItems[0], verificationCommands: ["git diff --check"] }] });
  transitionLoop(repo, loop.loopId, "running", new Date("2026-07-21T00:00:00.000Z"));
  beginLoopWorkItemImplementation(repo, loop.loopId, new Date("2026-07-21T00:00:10.000Z"));
  completeLoopWorkItemImplementation(repo, loop.loopId, "implemented", new Date("2026-07-21T00:00:20.000Z"));
  const completed = runNextLoopWorkItem(repo, loop.loopId, new Date("2026-07-21T00:01:00.000Z"));
  assert.equal(completed.status, "completed");
  assert.equal(completed.workItems[0].verificationEvidence?.[0].status, "passed");
  assert.equal(completed.lease, undefined);
});

test("analysis revision records changed fields and advances version", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-revise-"));
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems });
  const revised = reviseLoopAnalysis(repo, loop.loopId, { completionConditions: ["new condition"] });
  assert.equal(revised.analysisVersion, 2);
  assert.deepEqual(revised.analysisHistory?.[0].changedFields, ["completionConditions"]);
  assert.deepEqual(revised.workItems[0].completionConditions, ["new condition"]);
});

test("stale running loop lease is recovered as paused", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-stale-"));
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems });
  transitionLoop(repo, loop.loopId, "running", new Date("2026-07-21T00:00:00.000Z"));
  const recovered = recoverStaleLoopLeases(repo, new Date("2026-07-21T01:00:00.000Z"));
  assert.equal(recovered[0].status, "paused");
  assert.equal(recovered[0].lease, undefined);
});

test("checkpoint digest detects a loop change to an already dirty file", () => {
  const repo = createGitRepo("digest");
  writeFileSync(join(repo, "existing.txt"), "before loop\n");
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems: [{ ...workItems[0], allowedPaths: ["existing.txt"] }] });
  transitionLoop(repo, loop.loopId, "running"); beginLoopWorkItemImplementation(repo, loop.loopId);
  writeFileSync(join(repo, "existing.txt"), "changed by loop\n");
  const completed = completeLoopWorkItemImplementation(repo, loop.loopId, "changed existing dirty file");
  assert.deepEqual(completed.workItems[0].implementationEvidence?.changedFiles, ["existing.txt"]);
});

test("targeted analysis revision invalidates the work item and its dependents only", () => {
  const repo = createGitRepo("revision");
  const items = [workItems[0], { ...workItems[0], id: "work_002", dependencies: ["work_001"] }, { ...workItems[0], id: "work_003", dependencies: [] }];
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems: items });
  const revised = reviseLoopAnalysis(repo, loop.loopId, { completionConditions: ["revised"] }, new Date(), "work_001");
  assert.deepEqual(revised.analysisHistory?.[0].invalidatedWorkItemIds.sort(), ["work_001", "work_002"]);
  assert.equal(revised.workItems.find((item) => item.id === "work_003")?.status, "ready");
});

test("approved rollback removes only a loop-created regular file", () => {
  const repo = createGitRepo("rollback");
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems });
  createLoopCheckpoint(repo, loop.loopId, "before");
  writeFileSync(join(repo, "created.txt"), "loop output\n");
  const plan = buildRollbackReport(repo, loop.loopId);
  assert.deepEqual(plan.removableFiles, ["created.txt"]);
  executeApprovedRollback(repo, loop.loopId, ["created.txt"]);
  assert.equal(existsSync(join(repo, "created.txt")), false);
});

test("unexpected no-change result is blocked", () => {
  const repo = createGitRepo("result");
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems: [{ ...workItems[0], expectedResults: ["completed_changed"], verificationCommands: ["git diff --check"] }] });
  transitionLoop(repo, loop.loopId, "running"); beginLoopWorkItemImplementation(repo, loop.loopId); completeLoopWorkItemImplementation(repo, loop.loopId, "no change");
  const result = runNextLoopWorkItem(repo, loop.loopId);
  assert.equal(result.status, "blocked");
  assert.equal(result.workItems[0].lastError, "unexpected_result:completed_no_change");
});

test("manual approval requires separately recorded actor evidence", () => {
  const repo = createGitRepo("approval");
  const item = { ...workItems[0], completionConditions: [{ type: "manual_approval" as const, value: "security-review", approved: true }], verificationCommands: ["git diff --check"] };
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems: [item] });
  transitionLoop(repo, loop.loopId, "running"); beginLoopWorkItemImplementation(repo, loop.loopId); completeLoopWorkItemImplementation(repo, loop.loopId, "approved");
  assert.equal(runNextLoopWorkItem(repo, loop.loopId).status, "blocked");
  assert.equal(approveLoopCondition(repo, loop.loopId, "work_001", "security-review", "reviewer").status, "paused");
  transitionLoop(repo, loop.loopId, "running");
  assert.equal(runNextLoopWorkItem(repo, loop.loopId).status, "completed");
});

test("checkpoint parses renamed paths without arrow pseudo paths", () => {
  const repo = createGitRepo("rename");
  writeFileSync(join(repo, "old name.txt"), "tracked\n"); execFileSync("git", ["add", "."], { cwd: repo }); execFileSync("git", ["commit", "-m", "tracked"], { cwd: repo });
  renameSync(join(repo, "old name.txt"), join(repo, "새 이름.txt"));
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "codex_task_018_001", title: "loop", objective: "x", workItems });
  const checkpoint = createLoopCheckpoint(repo, loop.loopId, "before");
  assert.ok(checkpoint.changedFiles.includes("old name.txt"));
  assert.ok(checkpoint.changedFiles.includes("새 이름.txt"));
  assert.equal(checkpoint.changedFiles.some((path) => path.includes(" -> ")), false);
});

function createGitRepo(label: string): string {
  const repo = mkdtempSync(join(tmpdir(), `hcp-loop-${label}-`));
  execFileSync("git", ["init"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repo });
  return repo;
}
