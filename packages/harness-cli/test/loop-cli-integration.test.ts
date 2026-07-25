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
