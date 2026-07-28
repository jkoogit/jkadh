import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { addHcpTask, createHcpSession, readSessionById } from "../src/state/session-state.ts";

test("hcp work CLI adds, updates, and renders a session work graph", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-work-cli-"));
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  const session = createHcpSession(repo, { sessionNumber: "23", sessionName: "023_work_cli" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "CLI task" });
  const cli = join(process.cwd(), "src", "cli.ts");
  const run = (args: string[]): string => execFileSync(process.execPath, ["--experimental-strip-types", cli, ...args], {
    cwd: repo,
    encoding: "utf8"
  });

  const added = run([
    "hcp", "work", "add",
    "--session-id", session.sessionId,
    "--title", "graph output",
    "--status", "active",
    "--source-task-id", task.taskId,
    "--reason", "implementation started"
  ]);
  const workItem = readSessionById(repo, session.sessionId).workItems?.[0];
  assert.match(added, /added work item/);
  assert.ok(workItem);

  run([
    "hcp", "work", "update",
    "--session-id", session.sessionId,
    "--work-item-id", workItem.workItemId,
    "--status", "done",
    "--reason", "CLI verified"
  ]);
  const graph = run(["hcp", "work", "graph", "--session-id", session.sessionId]);
  assert.match(graph, /T1\.1 \[done\] graph output/);
  assert.match(graph, /```mermaid/);
  assert.match(graph, /task_1 --> work_1/);

  run(["hcp", "work", "add", "--session-id", session.sessionId, "--title", "approved backlog", "--status", "candidate", "--reason", "decision required"]);
  const candidate = readSessionById(repo, session.sessionId).workItems?.[1];
  assert.ok(candidate);
  const backlogRoot = join(repo, "docs", "15.로그", "backlog");
  mkdirSync(backlogRoot, { recursive: true });
  writeFileSync(join(backlogRoot, "README.md"), "| ID | 제목 | 상태 | 처리시점 | 우선순위 | 의존 | Issue | 문서 |\n|---|---|---|---|---|---|---|---|\n| BLG-001 | seed | Resolved | - | Low | - | - | - |\n");
  const decideArgs = ["hcp", "work", "decide", "--session-id", session.sessionId, "--work-item-id", candidate.workItemId, "--decision", "backlog", "--reason", "user approved"];
  run(decideArgs);
  run(decideArgs);
  const resolved = readSessionById(repo, session.sessionId).workItems?.[1];
  assert.equal(resolved?.status, "backlogged");
  assert.equal((readFileSync(join(backlogRoot, "README.md"), "utf8").match(/\| BLG-/g) ?? []).length, 2);
});

test("document backlog add reuses the document when HCP response linking is retried", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-backlog-response-retry-"));
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  const backlogRoot = join(repo, "docs", "15.로그", "backlog");
  mkdirSync(backlogRoot, { recursive: true });
  writeFileSync(join(backlogRoot, "README.md"), "| ID | title | status | timing | priority | dependency | Issue | path |\n|---|---|---|---|---|---|---|---|\n| BLG-001 | seed | Resolved | - | Low | - | - | - |\n");
  const session = createHcpSession(repo, { sessionNumber: "23", sessionName: "023_backlog_retry" });
  const cli = join(process.cwd(), "src", "cli.ts");
  const args = ["--experimental-strip-types", cli, "hcp", "backlog", "add", "--document", "--session-id", session.sessionId, "--title", "retry backlog", "--date", "2026-07-28"];
  execFileSync(process.execPath, args, { cwd: repo, encoding: "utf8" });
  execFileSync(process.execPath, args, { cwd: repo, encoding: "utf8" });

  const stored = readSessionById(repo, session.sessionId);
  assert.equal(stored.workItems?.length, 1);
  assert.equal(stored.workChangeSets?.length, 2);
  assert.equal((readFileSync(join(backlogRoot, "README.md"), "utf8").match(/\| BLG-/g) ?? []).length, 2);
});
