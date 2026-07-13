import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  addHcpTask,
  addHcpBacklog,
  buildHcpSessionHandoff,
  buildHcpSessionRetrospectiveSummary,
  buildHcpStateSummary,
  cleanupArchivedSessions,
  createHcpSession,
  deleteHcpBacklog,
  deleteHcpTask,
  transitionHcpSessionStatus,
  updateHcpTaskBranch,
  updateHcpTaskPullRequest,
  updateHcpSession,
  updateHcpTask
} from "../src/state/session-state.ts";

test("hcp session state creates per-session files with agent scoped ids", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-"));
  const now = new Date("2026-07-13T01:02:03.000Z");

  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_Harness_HCP_state",
    now
  });

  assert.equal(session.sessionId, "codex_ses_010_20260713_001");
  assert.equal(session.status, "active");
  assert.equal(existsSync(join(repo, ".hcp", "sessions", "active", `${session.sessionId}.json`)), true);
});

test("hcp session start archives previously complete sessions", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-archive-"));
  const first = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_first",
    now: new Date("2026-07-13T01:02:03.000Z")
  });
  transitionHcpSessionStatus(repo, first.sessionId, "complete", new Date("2026-07-13T02:00:00.000Z"));

  const second = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "11",
    sessionName: "011_second",
    now: new Date("2026-07-13T03:00:00.000Z")
  });
  const summary = buildHcpStateSummary(repo, second.sessionId);

  assert.equal(summary.activeSessions.length, 1);
  assert.equal(summary.archivedSessions.length, 1);
  assert.equal(summary.archivedSessions[0].sessionId, first.sessionId);
  assert.equal(summary.selectedSession?.sessionId, second.sessionId);
});

test("hcp task registration blocks when multiple active sessions exist without session id", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-multiple-"));
  createHcpSession(repo, { agentId: "codex", sessionNumber: "10", sessionName: "010_first", now: new Date("2026-07-13T01:00:00.000Z") });
  createHcpSession(repo, { agentId: "codex", sessionNumber: "11", sessionName: "011_second", now: new Date("2026-07-13T02:00:00.000Z") });

  assert.throws(() => addHcpTask(repo, {
    agentId: "codex",
    taskName: "ambiguous task"
  }), /Multiple active HCP sessions found/);
});

test("hcp task registration records task id under selected active session", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-task-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_task_session",
    now: new Date("2026-07-13T01:00:00.000Z")
  });

  const task = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "HCP state task",
    issueNumber: 73,
    branchName: "task_codex/073-hcp-state",
    now: new Date("2026-07-13T01:05:00.000Z")
  });
  const summary = buildHcpStateSummary(repo, session.sessionId);

  assert.equal(task.taskId, "codex_task_010_001");
  assert.equal(summary.selectedSession?.tasks[0].taskName, "HCP state task");
  assert.equal(summary.selectedSession?.tasks[0].issueNumber, 73);
});

test("hcp task update records PR tracking id and status", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-task-update-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_task_session",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const task = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "HCP state task",
    now: new Date("2026-07-13T01:05:00.000Z")
  });

  const closed = updateHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    status: "closed",
    pullRequestNumber: 74,
    pullRequestUrl: "https://github.com/jkoogit/jkadh/pull/74",
    now: new Date("2026-07-13T01:10:00.000Z")
  });

  assert.equal(closed.status, "closed");
  assert.equal(closed.pullRequest?.hcpPrId, "codex_pr_010_001");
  assert.equal(closed.pullRequest?.number, 74);
});

test("hcp session creation blocks duplicate active agent and session name", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-duplicate-"));
  createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_Harness_HCP_state",
    now: new Date("2026-07-13T01:00:00.000Z")
  });

  assert.throws(() => createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "11",
    sessionName: "010_Harness_HCP_state",
    now: new Date("2026-07-13T02:00:00.000Z")
  }), /Active HCP session already exists/);
});

test("hcp session creation allows parallel active sessions with different names", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-parallel-"));
  createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_first",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "11",
    sessionName: "011_second",
    now: new Date("2026-07-13T02:00:00.000Z")
  });

  assert.equal(buildHcpStateSummary(repo).activeSessions.length, 2);
});

test("hcp session can be updated but not deleted", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-session-update-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_old",
    now: new Date("2026-07-13T01:00:00.000Z")
  });

  const updated = updateHcpSession(repo, {
    sessionId: session.sessionId,
    sessionName: "010_new",
    linkedIssueNumber: 73,
    now: new Date("2026-07-13T01:05:00.000Z")
  });

  assert.equal(updated.sessionName, "010_new");
  assert.equal(updated.linkedIssue?.number, 73);
  assert.equal(updated.changeLog.at(-1)?.action, "session.link_issue");
});

test("hcp task delete only allows active shell tasks", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-task-delete-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_task_delete",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const active = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "empty task",
    now: new Date("2026-07-13T01:01:00.000Z")
  });

  const deleted = deleteHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: active.taskId,
    reason: "empty task",
    now: new Date("2026-07-13T01:02:00.000Z")
  });

  assert.equal(deleted.taskId, active.taskId);
  assert.equal(buildHcpStateSummary(repo, session.sessionId).selectedSession?.tasks.length, 0);
});

test("hcp task delete blocks closed tasks", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-task-delete-block-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_task_delete_block",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const task = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "closed task",
    now: new Date("2026-07-13T01:01:00.000Z")
  });
  updateHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    status: "closed",
    now: new Date("2026-07-13T01:02:00.000Z")
  });

  assert.throws(() => deleteHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId
  }), /Only active HCP tasks can be deleted/);
});

test("hcp backlog add and delete are tracked in session state", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-backlog-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_backlog",
    now: new Date("2026-07-13T01:00:00.000Z")
  });

  const item = addHcpBacklog(repo, {
    sessionId: session.sessionId,
    title: "temporary backlog",
    note: "discussion note",
    now: new Date("2026-07-13T01:01:00.000Z")
  });
  assert.equal(item.hcpBacklogId, "codex_blg_010_001");

  const deleted = deleteHcpBacklog(repo, {
    sessionId: session.sessionId,
    hcpBacklogId: item.hcpBacklogId,
    reason: "no longer needed",
    now: new Date("2026-07-13T01:02:00.000Z")
  });

  const selected = buildHcpStateSummary(repo, session.sessionId).selectedSession;
  assert.equal(deleted.hcpBacklogId, item.hcpBacklogId);
  assert.equal(selected?.backlogItems.length, 0);
  assert.equal(selected?.changeLog.at(-1)?.action, "backlog.delete");
});

test("hcp state tracks title and branch maintenance commands", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-maintenance-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_maintenance",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const task = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "maintenance task",
    now: new Date("2026-07-13T01:01:00.000Z")
  });

  updateHcpSession(repo, {
    sessionId: session.sessionId,
    linkedIssueNumber: 73,
    linkedIssueTitle: "[073]_[HCP]_maintenance",
    now: new Date("2026-07-13T01:02:00.000Z")
  });
  updateHcpTaskBranch(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    branchName: "task_codex/073-maintenance",
    now: new Date("2026-07-13T01:03:00.000Z")
  });
  updateHcpTaskPullRequest(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    pullRequestNumber: 74,
    pullRequestTitle: "[073]_(001)_maintenance",
    now: new Date("2026-07-13T01:04:00.000Z")
  });

  const selected = buildHcpStateSummary(repo, session.sessionId).selectedSession;
  assert.equal(selected?.linkedIssue?.title, "[073]_[HCP]_maintenance");
  assert.equal(selected?.tasks[0].branchName, "task_codex/073-maintenance");
  assert.equal(selected?.tasks[0].pullRequest?.title, "[073]_(001)_maintenance");
});

test("hcp state builds handoff and retrospective summary from session state", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-summary-"));
  const session = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_summary",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const task = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "summary task",
    issueNumber: 73,
    now: new Date("2026-07-13T01:01:00.000Z")
  });
  updateHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    status: "promoted",
    now: new Date("2026-07-13T01:02:00.000Z")
  });
  const selected = buildHcpStateSummary(repo, session.sessionId).selectedSession;

  assert.ok(selected);
  assert.match(buildHcpSessionHandoff(selected), /Completed tasks: codex_task_010_001 summary task/);
  assert.match(buildHcpSessionRetrospectiveSummary(selected), /HCP Session State/);
  assert.match(buildHcpSessionRetrospectiveSummary(selected), /codex_task_010_001 \[promoted\] summary task/);
});

test("hcp archived cleanup deletes old archived sessions after keep count", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-cleanup-"));
  const first = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "10",
    sessionName: "010_old",
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  transitionHcpSessionStatus(repo, first.sessionId, "complete", new Date("2026-01-02T00:00:00.000Z"));
  transitionHcpSessionStatus(repo, first.sessionId, "archived", new Date("2026-01-03T00:00:00.000Z"));
  const second = createHcpSession(repo, {
    agentId: "codex",
    sessionNumber: "11",
    sessionName: "011_recent",
    now: new Date("2026-07-01T00:00:00.000Z")
  });
  transitionHcpSessionStatus(repo, second.sessionId, "complete", new Date("2026-07-02T00:00:00.000Z"));
  transitionHcpSessionStatus(repo, second.sessionId, "archived", new Date("2026-07-03T00:00:00.000Z"));

  const result = cleanupArchivedSessions(repo, {
    keep: 1,
    olderThanDays: 30,
    now: new Date("2026-07-13T00:00:00.000Z")
  });

  assert.deepEqual(result.deleted.map((session) => session.sessionId), [first.sessionId]);
  assert.equal(buildHcpStateSummary(repo).archivedSessions.length, 1);
});
