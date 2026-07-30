import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildHarnessScopeGraphMarkdown, getHarnessScopeNode, listHarnessScopeNodes } from "../src/flows/harness-scope-graph.ts";
import { buildHarnessScopeReview } from "../src/flows/harness-scope-review.ts";
import { createLoopRun } from "../src/state/loop-state.ts";
import { addHcpBacklog, addHcpTask, addHcpWorkItem, createHcpSession } from "../src/state/session-state.ts";

test("Harness scope graph represents session, task, process, and Loop containment", () => {
  const nodes = listHarnessScopeNodes();
  const markdown = buildHarnessScopeGraphMarkdown();

  assert.equal(nodes.length, 13);
  assert.deepEqual(getHarnessScopeNode("task_start").parentIds, ["session_start"]);
  assert.deepEqual(getHarnessScopeNode("task_process").parentIds, ["task_start"]);
  assert.deepEqual(getHarnessScopeNode("loop_execute").parentIds, ["task_process"]);
  assert.deepEqual(getHarnessScopeNode("loop_rollback").parentIds, ["loop_analyze", "loop_execute", "loop_remediate"]);
  assert.match(markdown, /```mermaid\nflowchart TD/);
  assert.match(markdown, /session_start --> task_start/);
  assert.match(markdown, /task_start --> task_process/);
  assert.match(markdown, /task_process --> loop_execute/);
  assert.match(markdown, /loop_analyze --> loop_rollback/);
  assert.match(markdown, /loop_execute --> loop_rollback/);
  assert.match(markdown, /loop_remediate --> loop_rollback/);
  assert.ok(markdown.indexOf('task_process["3 태스크처리"]') < markdown.indexOf('task_close["2.2 태스크정리"]'));
  assert.ok(markdown.indexOf('task_promote["2.3 태스크승급"]') < markdown.indexOf('session_close["1.2 세션정리"]'));

  const cloned = getHarnessScopeNode("task_process");
  cloned.parentIds.push("session_close");
  assert.deepEqual(getHarnessScopeNode("task_process").parentIds, ["task_start"]);
});

test("review and missing-work requirements match the requested Harness commands", () => {
  for (const id of ["task_promote", "loop_approve", "loop_delete", "loop_restore", "loop_rollback", "session_close"] as const) {
    assert.equal(getHarnessScopeNode(id).reviewRequired, true, id);
  }
  for (const id of ["task_promote", "loop_delete", "loop_restore", "loop_rollback", "session_close"] as const) {
    assert.equal(getHarnessScopeNode(id).missingWorkCheckRequired, true, id);
  }
  assert.equal(getHarnessScopeNode("loop_approve").missingWorkCheckRequired, false);
});

test("scope review separates global Backlog from HCP session work and reports missing work", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-scope-review-"));
  writeBacklogIndex(repo);
  const session = createHcpSession(repo, { sessionNumber: "025", sessionName: "scope review" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "active task", issueNumber: 172 });
  addHcpWorkItem(repo, { sessionId: session.sessionId, sourceTaskId: task.taskId, title: "ready work", status: "ready", reason: "pending" });
  addHcpBacklog(repo, { sessionId: session.sessionId, title: "session follow-up" });
  createLoopRun(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    title: "active loop",
    objective: "verify review",
    workItems: [{
      id: "work_001",
      title: "loop work",
      dependencies: [],
      completionConditions: ["done"],
      expectedResults: ["completed_changed"],
      errorCases: ["failure"],
      allowedPaths: ["packages/harness-cli"],
      verificationCommands: ["npm test"]
    }]
  });

  const review = buildHarnessScopeReview(repo, session.sessionId, "task_promote");

  assert.equal(review.globalBacklog.length, 2);
  assert.match(review.markdown, /BLG-031 \[Deferred\]/);
  assert.match(review.markdown, new RegExp(`${task.taskId}=active`));
  assert.match(review.markdown, /Work Item T1\.1=ready/);
  assert.match(review.markdown, /session Backlog .*open/);
  assert.match(review.markdown, /Loop .*work_001=ready/);
  assert.doesNotMatch(review.missingWorkItems.join("\n"), /BLG-031/);
});

test("Loop approval review includes status without requiring a missing-work decision", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-scope-approve-"));
  const session = createHcpSession(repo, { sessionNumber: "025", sessionName: "approve review" });
  addHcpTask(repo, { sessionId: session.sessionId, taskName: "active task", issueNumber: 172 });

  const review = buildHarnessScopeReview(repo, session.sessionId, "loop_approve");

  assert.equal(review.missingWorkCheckRequired, false);
  assert.deepEqual(review.missingWorkItems, []);
  assert.match(review.markdown, /status: not_required/);
});

function writeBacklogIndex(repo: string): void {
  const directory = join(repo, "docs", "15.로그", "backlog");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "README.md"), [
    "| ID | 제목 | 상태 | 처리시점 | 우선순위 | 의존 대상 | 연결 Issue | 경로 |",
    "|---|---|---|---|---|---|---|---|",
    "| BLG-031 | deferred work | Deferred | 정기 점검 시 | Medium | evidence | #136 | [BLG-031](./BLG-031.md) |",
    "| BLG-040 | ready work | Ready | 다음 Issue 선정 시 | High | - | - | [BLG-040](./BLG-040.md) |"
  ].join("\n"), "utf8");
}
