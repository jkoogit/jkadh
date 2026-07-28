import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createBacklogDocument } from "../src/docs/backlog-document.ts";

import {
  addHcpTask,
  addHcpBacklog,
  addHcpWorkItem,
  applyPendingHcpWorkFeedback,
  buildHcpSessionHandoff,
  buildHcpSessionRetrospectiveSummary,
  buildHcpWorkItemGraph,
  buildHcpWorkItemMermaid,
  buildHcpWorkChangeResponse,
  buildHcpStateSummary,
  cleanupArchivedSessions,
  createHcpSession,
  deleteHcpBacklog,
  deleteHcpTask,
  evaluateHcpTaskCloseReadiness,
  getHcpTaskPhase,
  recordHcpCriteriaRevision,
  recordHcpTaskDiscovery,
  recordHcpTaskProcessEvidence,
  recordHcpTaskRecoveryEvidence,
  recordHcpLifecyclePolicyEvidence,
  readSessionById,
  recordHcpWorkFeedback,
  requireHcpWorkChangeSetAfter,
  resolveHcpSourceBacklogs,
  syncHcpSessionWorkItems,
  linkHcpTaskLoop,
  transitionHcpSessionStatus,
  transitionHcpTaskPhase,
  updateHcpTaskDiscovery,
  updateHcpTaskBranch,
  updateHcpTaskBoundary,
  updateHcpTaskPullRequest,
  updateHcpWorkItem,
  updateHcpSession,
  updateHcpTask
} from "../src/state/session-state.ts";

test("hcp work feedback stays pending until the next tagged command applies it", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-work-feedback-"));
  const session = createHcpSession(repo, { sessionNumber: "23", sessionName: "023_feedback" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "feedback task" });
  const item = addHcpWorkItem(repo, {
    sessionId: session.sessionId,
    title: "original step",
    status: "ready",
    sourceTaskId: task.taskId,
    reason: "response plan"
  });

  const feedback = recordHcpWorkFeedback(repo, {
    sessionId: session.sessionId,
    workItemId: item.workItemId,
    title: "corrected step",
    status: "active",
    reason: "user correction"
  });
  let selected = readSessionById(repo, session.sessionId);
  assert.equal(feedback.statusOfFeedback, "pending");
  assert.equal(selected.workItems?.[0]?.title, "original step");

  const applied = applyPendingHcpWorkFeedback(repo, session.sessionId, new Date("2026-07-28T01:00:00.000Z"));
  selected = readSessionById(repo, session.sessionId);
  assert.equal(applied[0]?.statusOfFeedback, "applied");
  assert.equal(selected.workItems?.[0]?.title, "corrected step");
  assert.equal(selected.workItems?.[0]?.status, "active");
  assert.equal(selected.workFeedback?.[0]?.statusOfFeedback, "applied");
});

test("hcp work feedback batch is not persisted when a later correction is invalid", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-work-feedback-atomic-"));
  const session = createHcpSession(repo, { sessionNumber: "23", sessionName: "023_feedback_atomic" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "feedback task" });
  const first = addHcpWorkItem(repo, { sessionId: session.sessionId, title: "first", status: "ready", sourceTaskId: task.taskId });
  const second = addHcpWorkItem(repo, { sessionId: session.sessionId, title: "second", status: "ready", sourceTaskId: task.taskId });
  recordHcpWorkFeedback(repo, { sessionId: session.sessionId, workItemId: first.workItemId, title: "changed first", reason: "valid correction" });
  recordHcpWorkFeedback(repo, { sessionId: session.sessionId, workItemId: second.workItemId, parentId: second.workItemId, reason: "invalid self parent" });

  assert.throws(() => applyPendingHcpWorkFeedback(repo, session.sessionId), /cannot reference itself/);
  const selected = readSessionById(repo, session.sessionId);
  assert.equal(selected.workItems?.find((item) => item.workItemId === first.workItemId)?.title, "first");
  assert.deepEqual(selected.workFeedback?.map((feedback) => feedback.statusOfFeedback), ["pending", "pending"]);
  assert.deepEqual(selected.workFeedback?.map((feedback) => feedback.applyAttempts), [1, 1]);
  assert.match(selected.workFeedback?.[0]?.lastApplyError ?? "", /cannot reference itself/);
  assert.equal(selected.changeLog.at(-1)?.action, "work_item.feedback_apply_failed");
});

test("hcp response work sync persists neither items nor change set when a later proposal is invalid", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-response-sync-atomic-"));
  const session = createHcpSession(repo, { sessionNumber: "23", sessionName: "023_sync_atomic" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "sync task" });
  assert.throws(() => syncHcpSessionWorkItems(repo, {
    sessionId: session.sessionId,
    sourceCommand: "task_process",
    sourceTaskId: task.taskId,
    items: [
      { title: "valid first", status: "done", reason: "valid" },
      { title: "invalid second", status: "done", reason: "invalid", dependsOnIds: ["missing-work"] }
    ]
  }), /work item not found/);
  const selected = readSessionById(repo, session.sessionId);
  assert.equal(selected.workItems?.length ?? 0, 0);
  assert.equal(selected.workChangeSets?.length ?? 0, 0);
});

test("hcp response gate rejects a missing change set and accepts the next recorded set", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-response-gate-"));
  const session = createHcpSession(repo, { sessionNumber: "23", sessionName: "023_response_gate" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "response gate" });
  assert.throws(() => requireHcpWorkChangeSetAfter(repo, session.sessionId, "task_process", 0, task.taskId), /change set missing/);
  syncHcpSessionWorkItems(repo, {
    sessionId: session.sessionId,
    sourceCommand: "task_process",
    sourceTaskId: task.taskId,
    items: [{ title: "record response work", status: "done", reason: "gate evidence" }]
  });
  assert.equal(requireHcpWorkChangeSetAfter(repo, session.sessionId, "task_process", 0, task.taskId).changeSetId, "SWP-023-001");
});

test("hcp response work sync records delta and reuses fingerprints", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-response-work-sync-"));
  const session = createHcpSession(repo, { sessionNumber: "23", sessionName: "023_response_sync" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "response task" });
  const first = syncHcpSessionWorkItems(repo, {
    sessionId: session.sessionId,
    sourceCommand: "task_start",
    sourceTaskId: task.taskId,
    sourceTurnId: "turn-1",
    items: [{ title: "implementation step", status: "ready", reason: "response plan" }],
    excludedSuggestions: ["code search"]
  });
  const second = syncHcpSessionWorkItems(repo, {
    sessionId: session.sessionId,
    sourceCommand: "task_process",
    sourceTaskId: task.taskId,
    sourceTurnId: "turn-2",
    items: [{ title: "implementation step", status: "active", reason: "response execution" }]
  });
  const third = syncHcpSessionWorkItems(repo, {
    sessionId: session.sessionId,
    sourceCommand: "task_process",
    sourceTaskId: task.taskId,
    items: [{ title: "implementation step", status: "active", reason: "same response repeated" }]
  });
  const selected = readSessionById(repo, session.sessionId);

  assert.equal(first.addedWorkItemIds.length, 1);
  assert.equal(second.updatedWorkItemIds.length, 1);
  assert.equal(third.reusedWorkItemIds.length, 1);
  assert.equal(selected.workItems?.length, 1);
  assert.equal(selected.workChangeSets?.length, 3);
  assert.match(buildHcpWorkChangeResponse(selected, first), /\[NEW\] T1\.1/);
  assert.match(buildHcpWorkChangeResponse(selected, first), /등록 제외: code search/);
});

test("hcp session work items keep hierarchy, relations, evidence, and stable backlog candidates", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-session-work-items-"));
  const session = createHcpSession(repo, {
    sessionNumber: "23",
    sessionName: "023_session_work_management",
    now: new Date("2026-07-28T00:00:00.000Z")
  });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "work item MVP" });
  const followUpTask = addHcpTask(repo, {
    sessionId: session.sessionId,
    taskName: "derived task",
    derivedFromTaskId: task.taskId,
    dependsOnTaskIds: [task.taskId]
  });
  const root = addHcpWorkItem(repo, {
    sessionId: session.sessionId,
    title: "state model",
    status: "ready",
    sourceTaskId: task.taskId,
    reason: "planned MVP step"
  });
  const childInput = {
    sessionId: session.sessionId,
    title: "session close summary",
    status: "active" as const,
    sourceTaskId: task.taskId,
    parentId: root.workItemId,
    derivedFromId: root.workItemId,
    dependsOnIds: [root.workItemId],
    reason: "implementation started"
  };
  assert.throws(() => addHcpWorkItem(repo, childInput), /dependencies are unfinished/);

  updateHcpWorkItem(repo, {
    sessionId: session.sessionId,
    workItemId: root.workItemId,
    status: "done",
    reason: "unit tests passed",
    detail: "state model verified"
  });
  const child = addHcpWorkItem(repo, childInput);
  const deferred = updateHcpWorkItem(repo, {
    sessionId: session.sessionId,
    workItemId: child.workItemId,
    status: "deferred",
    reason: "requires a follow-up task"
  });
  const selected = readSessionById(repo, session.sessionId);
  const firstSummary = buildHcpSessionRetrospectiveSummary(selected);
  const secondSummary = buildHcpSessionRetrospectiveSummary(readSessionById(repo, session.sessionId));

  assert.equal(root.displayId, "T1.1");
  assert.equal(child.displayId, "T1.1.1");
  assert.equal(deferred.backlogCandidateId, `candidate:${child.workItemId}`);
  assert.match(buildHcpWorkItemGraph(selected), /T1\.1 \[done\] state model/);
  assert.match(buildHcpWorkItemGraph(selected), /T1 \[active\] work item MVP/);
  assert.match(buildHcpWorkItemMermaid(selected), /flowchart TD/);
  assert.match(buildHcpWorkItemMermaid(selected), /depends/);
  assert.match(buildHcpWorkItemMermaid(selected), /task_1 -. derived .-> task_2/);
  assert.equal(followUpTask.dependsOnTaskIds?.[0], task.taskId);
  assert.match(firstSummary, new RegExp(`candidate:${child.workItemId}`));
  assert.equal(firstSummary, secondSummary);
  assert.equal(selected.workItems?.length, 2);
  assert.equal(selected.workItems?.[0].evidence.at(-1)?.detail, "state model verified");
  const backlogRoot = join(repo, "docs", "15.로그", "backlog");
  mkdirSync(backlogRoot, { recursive: true });
  writeFileSync(join(backlogRoot, "README.md"), "| ID | 제목 | 상태 | 처리시점 | 우선순위 | 의존 | Issue | 문서 |\n|---|---|---|---|---|---|---|---|\n| BLG-001 | seed | Resolved | - | Low | - | - | - |\n");
  const backlog = createBacklogDocument(repo, { title: "follow-up candidate", source: `HCP candidate:${child.workItemId}` });
  const backlogged = updateHcpWorkItem(repo, {
    sessionId: session.sessionId,
    workItemId: child.workItemId,
    status: "backlogged",
    backlogId: backlog.backlogId,
    backlogPath: backlog.filePath,
    reason: "user approved backlog conversion"
  });
  assert.equal(backlogged.backlogCandidateId, `candidate:${child.workItemId}`);
  assert.equal(backlogged.status, "backlogged");
  assert.throws(() => updateHcpWorkItem(repo, {
    sessionId: session.sessionId,
    workItemId: root.workItemId,
    parentId: child.workItemId
  }), /parent cycle/);
  assert.throws(() => updateHcpWorkItem(repo, {
    sessionId: session.sessionId,
    workItemId: root.workItemId,
    dependsOnIds: [child.workItemId]
  }), /dependency cycle/);
});

test("legacy task keeps implementing phase and close compatibility", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-legacy-task-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "legacy" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "legacy task" });
  assert.equal(getHcpTaskPhase(task), "implementing");
  assert.equal(evaluateHcpTaskCloseReadiness(task).ready, true);
});

test("criteria revisions preserve history, invalidate close evidence and enforce phase gates", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-criteria-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "criteria" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "criteria task" });
  updateHcpTask(repo, { sessionId: session.sessionId, taskId: task.taskId, status: "active", closeEvidence: { source: "task_close", outcome: "passed", completionSummary: "old", verificationResult: "old", outOfScope: "none", remainingWork: "none" } });
  const provisional = recordHcpCriteriaRevision(repo, { sessionId: session.sessionId, taskId: task.taskId, status: "provisional", criteria: ["tests pass"], reason: "implementation boundary" });
  assert.equal(provisional.closeEvidence, undefined);
  assert.match(provisional.criteriaRevisions?.[0].invalidatedEvidenceIds[0] ?? "", /^task-close:/);
  transitionHcpTaskPhase(repo, session.sessionId, task.taskId, "stabilizing");
  const frozen = recordHcpCriteriaRevision(repo, { sessionId: session.sessionId, taskId: task.taskId, status: "frozen", criteria: ["tests pass"], reason: "stabilized", phase: "stabilizing" });
  assert.equal(frozen.criteriaRevisions?.[0].status, "superseded");
  assert.equal(evaluateHcpTaskCloseReadiness(frozen).ready, true);
  assert.equal(transitionHcpTaskPhase(repo, session.sessionId, task.taskId, "close_ready").phase, "close_ready");
  assert.throws(() => recordHcpCriteriaRevision(repo, { sessionId: session.sessionId, taskId: task.taskId, status: "provisional", criteria: ["changed"], reason: "reopen" }), /explicit evidence or work item invalidation/);
});

test("required discovery blocks close until evidence-backed resolution", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-discovery-"));
  const session = createHcpSession(repo, { sessionNumber: "18", sessionName: "discovery" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "discovery task" });
  recordHcpCriteriaRevision(repo, { sessionId: session.sessionId, taskId: task.taskId, status: "frozen", criteria: ["safe"], reason: "baseline", phase: "stabilizing" });
  const discovered = recordHcpTaskDiscovery(repo, { sessionId: session.sessionId, taskId: task.taskId, category: "runtime", severity: "high", disposition: "required", blocksCurrentTask: true, evidence: "verification warning", rationale: "unsafe runner" });
  assert.equal(evaluateHcpTaskCloseReadiness(discovered).ready, false);
  const discoveryId = discovered.discoveries?.[0].discoveryId ?? "";
  const resolved = updateHcpTaskDiscovery(repo, { sessionId: session.sessionId, taskId: task.taskId, discoveryId, disposition: "required", blocksCurrentTask: false, evidence: "regression passed", rationale: "runner fixed" });
  assert.equal(evaluateHcpTaskCloseReadiness(resolved).ready, true);
  assert.throws(() => recordHcpTaskDiscovery(repo, { sessionId: session.sessionId, taskId: task.taskId, category: "idea", severity: "low", disposition: "follow_up", blocksCurrentTask: true, evidence: "idea", rationale: "later" }), /cannot block/);
});

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
  assert.equal(summary.archivedSessions[0].status, "archived");
  assert.equal(summary.archivedSessions[0].completedAt, "2026-07-13T02:00:00.000Z");
  assert.equal(summary.archivedSessions[0].archivedAt, "2026-07-13T03:00:00.000Z");
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
    scope: "store structured task boundary",
    outOfScope: "deployment",
    completionCriteria: "boundary is persisted",
    verificationMethod: "npm test",
    now: new Date("2026-07-13T01:05:00.000Z")
  });
  const summary = buildHcpStateSummary(repo, session.sessionId);

  assert.equal(task.taskId, "codex_task_010_001");
  assert.equal(summary.selectedSession?.tasks[0].taskName, "HCP state task");
  assert.equal(summary.selectedSession?.tasks[0].issueNumber, 73);
  assert.equal(summary.selectedSession?.tasks[0].scope, "store structured task boundary");
  assert.equal(summary.selectedSession?.tasks[0].outOfScope, "deployment");
  assert.equal(summary.selectedSession?.tasks[0].completionCriteria, "boundary is persisted");
  assert.equal(summary.selectedSession?.tasks[0].verificationMethod, "npm test");
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

test("hcp task boundary update backfills structured lifecycle fields", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-task-boundary-"));
  const session = createHcpSession(repo, { sessionNumber: "19", sessionName: "019_boundary" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "boundary task" });
  const updated = updateHcpTaskBoundary(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    scope: "scope",
    outOfScope: "excluded",
    completionCriteria: "complete",
    verificationMethod: "test",
    sourceBacklogIds: ["codex_blg_018_001"]
  });

  assert.equal(updated.scope, "scope");
  assert.deepEqual(updated.sourceBacklogIds, ["codex_blg_018_001"]);
  assert.equal(readSessionById(repo, session.sessionId).changeLog?.at(-1)?.action, "task.update_boundary");
});

test("lifecycle policy evidence records stage version and application time", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-policy-evidence-"));
  const session = createHcpSession(repo, { sessionNumber: "19", sessionName: "019_policy" });
  recordHcpLifecyclePolicyEvidence(repo, {
    sessionId: session.sessionId,
    stage: "task_start",
    outcome: "passed",
    evaluatedPolicies: [{ policyId: "task-start.scope", policyVersion: 1, stage: "task_start", status: "pass", reason: "scope confirmed" }],
    now: new Date("2026-07-25T01:00:00.000Z")
  });
  const stored = readSessionById(repo, session.sessionId);
  assert.equal(stored.lifecyclePolicyEvidence?.[0].evaluatedPolicies[0].policyVersion, 1);
  assert.equal(stored.lifecyclePolicyEvidence?.[0].recordedAt, "2026-07-25T01:00:00.000Z");
  assert.equal(stored.changeLog.at(-1)?.action, "policy.evaluate");
});

test("hcp task close stores structured verification evidence", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-evidence-"));
  const session = createHcpSession(repo, {
    sessionNumber: "10",
    sessionName: "010_evidence",
    now: new Date("2026-07-13T01:00:00.000Z")
  });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "evidence task" });

  const closed = updateHcpTask(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    status: "closed",
    closeEvidence: {
      source: "task_close",
      outcome: "passed",
      completionSummary: "implemented",
      verificationResult: "npm test passed",
      outOfScope: "promotion",
      remainingWork: "none"
    },
    now: new Date("2026-07-13T01:10:00.000Z")
  });

  assert.equal(closed.closeEvidence?.outcome, "passed");
  assert.equal(closed.closeEvidence?.recordedAt, "2026-07-13T01:10:00.000Z");
  assert.equal(buildHcpStateSummary(repo, session.sessionId).selectedSession?.changeLog.at(-1)?.action, "task.record_close_evidence");
});

test("hcp task process appends remediation loop evidence without closing the task", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-process-evidence-"));
  const session = createHcpSession(repo, { sessionNumber: "10", sessionName: "010_process_evidence" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "process task" });

  const updated = recordHcpTaskProcessEvidence(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    status: "completed",
    iterations: [{
      iteration: 1,
      evaluatedPolicies: [],
      blockedPolicies: [],
      appliedFixes: [],
      fingerprint: "[]",
      result: "passed"
    }],
    now: new Date("2026-07-21T01:00:00.000Z")
  });

  assert.equal(updated.status, "active");
  assert.equal(updated.processEvidence?.[0].status, "completed");
  assert.equal(updated.processEvidence?.[0].recordedAt, "2026-07-21T01:00:00.000Z");
});

test("hcp task stores structured GitHub recovery evidence", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-recovery-evidence-"));
  const session = createHcpSession(repo, { sessionNumber: "19", sessionName: "019_recovery_evidence" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "recovery task" });

  const updated = recordHcpTaskRecoveryEvidence(repo, {
    sessionId: session.sessionId,
    taskId: task.taskId,
    failedAction: "create_pr",
    completedActions: ["commit_changes", "push_branch"],
    category: "network",
    retryable: true,
    failure: "Could not resolve host: api.github.com",
    recoveryAction: "retry only create_pr",
    now: new Date("2026-07-25T04:00:00.000Z")
  });

  assert.deepEqual(updated.recoveryEvidence?.[0], {
    failedAction: "create_pr",
    completedActions: ["commit_changes", "push_branch"],
    category: "network",
    retryable: true,
    failure: "Could not resolve host: api.github.com",
    recoveryAction: "retry only create_pr",
    recordedAt: "2026-07-25T04:00:00.000Z"
  });
  assert.equal(readSessionById(repo, session.sessionId).changeLog.at(-1)?.action, "task.record_recovery_evidence");
});

test("hcp task records linked loop ids without duplicates", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-loop-link-"));
  const session = createHcpSession(repo, { sessionNumber: "10", sessionName: "010_loop_link" });
  const task = addHcpTask(repo, { sessionId: session.sessionId, taskName: "loop task" });
  linkHcpTaskLoop(repo, session.sessionId, task.taskId, "codex_loop_010_001");
  const linked = linkHcpTaskLoop(repo, session.sessionId, task.taskId, "codex_loop_010_001");
  assert.deepEqual(linked.loopIds, ["codex_loop_010_001"]);
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

test("source backlog resolution updates an archived prior session with task evidence", () => {
  const repo = mkdtempSync(join(tmpdir(), "hcp-state-source-backlog-"));
  const previous = createHcpSession(repo, { sessionNumber: "18", sessionName: "018_previous" });
  const backlog = addHcpBacklog(repo, { sessionId: previous.sessionId, title: "follow-up" });
  transitionHcpSessionStatus(repo, previous.sessionId, "complete");
  createHcpSession(repo, { sessionNumber: "19", sessionName: "019_current" });

  const resolved = resolveHcpSourceBacklogs(repo, {
    sourceBacklogIds: [backlog.hcpBacklogId],
    taskId: "codex_task_019_001",
    issueNumber: 127,
    verificationResult: "170 tests passed",
    now: new Date("2026-07-25T02:00:00.000Z")
  });

  assert.equal(resolved[0].status, "closed");
  assert.equal(resolved[0].resolvedByTaskId, "codex_task_019_001");
  assert.equal(readSessionById(repo, previous.sessionId).backlogItems[0].resolutionEvidence, "170 tests passed");
  assert.equal(readSessionById(repo, previous.sessionId).changeLog.at(-1)?.action, "backlog.resolve");
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
  assert.match(buildHcpSessionRetrospectiveSummary(selected), /Session status at snapshot: active/);
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
