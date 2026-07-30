import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { addHcpTask, createHcpSession, readSessionById } from "../src/state/session-state.ts";
import { beginLoopWorkItemImplementation, createLoopRun, listLoopRuns, transitionLoop } from "../src/state/loop-state.ts";

const cliPath = join(process.cwd(), "src", "cli.ts");

test("loop analysis report alias reaches loop command without writes", () => {
  const reportTag = "#\ub8e8\ud504\ubd84\uc11d.\ubcf4\uace0";
  const output = execFileSync(process.execPath, ["--experimental-strip-types", cliPath, "tag", reportTag, "--session-id", "test-session", "--task-id", "test-task", "--title", "test", "--objective", "test", "--completion", "pass", "--expected-results", "completed_no_change", "--error-cases", "verification_failed", "--allowed-paths", "packages/harness-cli/**", "--verification", "git diff --check"], { cwd: process.cwd(), encoding: "utf8" });
  assert.match(output, /Loop analysis report/);
  assert.match(output, /write actions: loop creation blocked/);
});

test("registry analysis creates multi-work-item loop without single-item options", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-cli-registry-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "registry-test" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "registry task" });
  const registryDir = join(repo, ".hcp", "registries"); mkdirSync(registryDir, { recursive: true });
  writeFileSync(join(registryDir, "valid.json"), JSON.stringify({
    title: "registry", objective: "validate bootstrap", workItems: [
      { id: "work_001", title: "one", dependencies: [], completionConditions: ["done"], expectedResults: ["completed_no_change"], errorCases: ["failed"], allowedPaths: ["src/**"], verificationCommands: ["git diff --check"] },
      { id: "work_002", title: "two", dependencies: ["work_001"], completionConditions: ["done"], expectedResults: ["completed_no_change"], errorCases: ["failed"], allowedPaths: ["test/**"], verificationCommands: ["git diff --check"] }
    ]
  }), "utf8");
  const output = execFileSync(process.execPath, ["--experimental-strip-types", cliPath, "loop", "analyze", "--session-id", session.sessionId, "--task-id", task.taskId, "--registry-path", ".hcp/registries/valid.json"], { cwd: repo, encoding: "utf8" });
  assert.match(output, /status: analysis_ready/);
  assert.equal(listLoopRuns(repo, task.taskId).at(0)?.workItems.length, 2);
  assert.equal(readSessionById(repo, session.sessionId).tasks[0].loopIds?.length, 1);
});

test("invalid registry path is blocked without loop or task linkage", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-cli-invalid-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "invalid-registry-test" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "registry task" });
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, "loop", "analyze", "--session-id", session.sessionId, "--task-id", task.taskId, "--registry-path", "../outside.json"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /registry path must stay inside repository/);
  assert.equal(listLoopRuns(repo, task.taskId).length, 0);
  assert.equal(readSessionById(repo, session.sessionId).tasks[0].loopIds, undefined);
});

test("malformed work item is blocked as a registry error without throwing", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-cli-malformed-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "malformed-registry-test" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "registry task" });
  const registryDir = join(repo, ".hcp", "registries"); mkdirSync(registryDir, { recursive: true });
  writeFileSync(join(registryDir, "malformed.json"), JSON.stringify({ title: "bad", objective: "blocked", workItems: [null, { id: "work_002" }] }), "utf8");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, "loop", "analyze", "--session-id", session.sessionId, "--task-id", task.taskId, "--registry-path", ".hcp/registries/malformed.json"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /workItems\[0\]: must be an object/);
  assert.match(result.stdout, /workItems\[1\]: dependencies must be an array/);
  assert.equal(listLoopRuns(repo, task.taskId).length, 0);
});

test("invalid task target is blocked before loop creation", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-cli-target-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "target-test" });
  const registryDir = join(repo, ".hcp", "registries"); mkdirSync(registryDir, { recursive: true });
  writeFileSync(join(registryDir, "valid.json"), JSON.stringify({ title: "valid", objective: "target validation", workItems: [{ id: "work_001", title: "one", dependencies: [], completionConditions: ["done"], expectedResults: ["completed_no_change"], errorCases: ["failed"], allowedPaths: ["src/**"], verificationCommands: ["git diff --check"] }] }), "utf8");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, "loop", "analyze", "--session-id", session.sessionId, "--task-id", "missing-task", "--registry-path", ".hcp/registries/valid.json"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /task does not belong to session/);
  assert.equal(listLoopRuns(repo).length, 0);
});

test("registry symlink resolving outside repository is blocked", (context) => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-cli-symlink-"));
  const outside = mkdtempSync(join(tmpdir(), "hcp-loop-cli-outside-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "symlink-test" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "registry task" });
  writeFileSync(join(outside, "registry.json"), JSON.stringify({ title: "outside", objective: "must block", workItems: [] }), "utf8");
  const link = join(repo, ".hcp", "external");
  try { symlinkSync(outside, link, "junction"); } catch { context.skip("symbolic links are unavailable in this environment"); return; }
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, "loop", "analyze", "--session-id", session.sessionId, "--task-id", task.taskId, "--registry-path", ".hcp/external/registry.json"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /registry real path must stay inside repository/);
  assert.equal(listLoopRuns(repo).length, 0);
});

test("loop execute completes implementing item before starting another ready item", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-cli-priority-"));
  execFileSync("git", ["init"], { cwd: repo }); execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo }); execFileSync("git", ["config", "user.name", "Test"], { cwd: repo }); execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: repo });
  const definition = { title: "item", dependencies: [] as string[], completionConditions: ["done"], expectedResults: ["completed_no_change"], errorCases: ["failed"], allowedPaths: ["src/**"], verificationCommands: ["git diff --check"] };
  const loop = createLoopRun(repo, { sessionId: "s", taskId: "task", title: "priority", objective: "handoff first", workItems: [{ ...definition, id: "work_001" }, { ...definition, id: "work_002" }] });
  transitionLoop(repo, loop.loopId, "running"); beginLoopWorkItemImplementation(repo, loop.loopId);
  execFileSync(process.execPath, ["--experimental-strip-types", cliPath, "loop", "execute", "--loop-id", loop.loopId, "--task-id", "task", "--implementation-summary", "no changes"], { cwd: repo, encoding: "utf8" });
  const updated = listLoopRuns(repo, "task")[0];
  assert.equal(updated.workItems[0].status, "completed");
  assert.equal(updated.workItems[1].status, "ready");
});

test("Loop approval, deletion, restoration, and rollback reports include the common scope review", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-loop-cli-review-"));
  const session = createHcpSession(repo, { sessionNumber: "25", sessionName: "loop review" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "loop review task" });
  const definition = {
    id: "work_001",
    title: "review item",
    dependencies: [] as string[],
    completionConditions: [{ type: "manual_approval" as const, value: "approved", required: true }],
    expectedResults: ["completed_with_approved_exception"],
    errorCases: ["approval denied"],
    allowedPaths: ["src/**"],
    verificationCommands: ["git diff --check"]
  };

  const approvedLoop = createLoopRun(repo, {
    sessionId: session.sessionId, taskId: task.taskId, title: "approval", objective: "review approval", workItems: [definition]
  });
  const approveOutput = execFileSync(process.execPath, [
    "--experimental-strip-types", cliPath, "loop", "approve", "--loop-id", approvedLoop.loopId,
    "--task-id", task.taskId, "--work-item-id", "work_001", "--condition-value", "approved", "--approved-by", "jk"
  ], { cwd: repo, encoding: "utf8" });
  assert.match(approveOutput, /Harness Scope Review/);
  assert.match(approveOutput, /trigger: loop_approve/);
  assert.match(approveOutput, /missing-work check required: no/);
  assert.match(approveOutput, /Harness Completion Protocol/);
  assert.match(approveOutput, /harness: loop_approve/);
  assert.match(approveOutput, /#루프실행\{/);

  const managedLoop = createLoopRun(repo, {
    sessionId: session.sessionId, taskId: task.taskId, title: "managed", objective: "review lifecycle", workItems: [{ ...definition, id: "work_002" }]
  });
  const rejectedDelete = spawnSync(process.execPath, [
    "--experimental-strip-types", cliPath, "loop", "delete", "--loop-id", managedLoop.loopId,
    "--task-id", task.taskId, "--reason", "invalid exclusion", "--exclusion-approved", "false"
  ], { cwd: repo, encoding: "utf8" });
  assert.equal(rejectedDelete.status, 2);
  assert.match(rejectedDelete.stdout, /required disposition missing: yes/);
  assert.match(rejectedDelete.stdout, /state change: not applied/);
  assert.match(rejectedDelete.stdout, /Next prompt suppressed/);
  assert.equal(listLoopRuns(repo, task.taskId, true).find((loop) => loop.loopId === managedLoop.loopId)?.status, "analysis_ready");

  const deleteOutput = execFileSync(process.execPath, [
    "--experimental-strip-types", cliPath, "loop", "delete", "--loop-id", managedLoop.loopId,
    "--task-id", task.taskId, "--reason", "superseded", "--exclusion-approved", "true"
  ], { cwd: repo, encoding: "utf8" });
  assert.match(deleteOutput, /trigger: loop_delete/);
  assert.match(deleteOutput, /Global Document Backlog/);
  assert.match(deleteOutput, /HCP Session Work Status/);
  assert.match(deleteOutput, /missing-work check required: yes/);
  assert.match(deleteOutput, /harness: loop_delete/);
  assert.match(deleteOutput, /#태스크처리\{/);

  const restoreOutput = execFileSync(process.execPath, [
    "--experimental-strip-types", cliPath, "loop", "restore", "--loop-id", managedLoop.loopId, "--task-id", task.taskId
  ], { cwd: repo, encoding: "utf8" });
  assert.match(restoreOutput, /trigger: loop_restore/);
  assert.match(restoreOutput, /status: items_found/);
  assert.match(restoreOutput, /harness: loop_restore/);
  assert.match(restoreOutput, /#루프실행\{/);

  transitionLoop(repo, managedLoop.loopId, "paused");
  const rollbackOutput = execFileSync(process.execPath, [
    "--experimental-strip-types", cliPath, "loop", "rollback", "--report", "--loop-id", managedLoop.loopId, "--task-id", task.taskId
  ], { cwd: repo, encoding: "utf8" });
  assert.match(rollbackOutput, /trigger: loop_rollback/);
  assert.match(rollbackOutput, /Missing Work Check/);
  assert.match(rollbackOutput, /harness: loop_rollback/);
  assert.match(rollbackOutput, /required prompt field invalid: 롤백승인경로/);
  assert.match(rollbackOutput, /Next prompt suppressed/);
});
