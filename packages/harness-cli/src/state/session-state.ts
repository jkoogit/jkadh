import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hasBacklogIndexEntry } from "../docs/backlog-index.ts";
import type { PolicyRemediationIteration, PolicyRemediationLoopStatus } from "../gates/policy-remediation-loop.ts";
import type { HarnessStage, PolicyResult } from "../gates/stage-policy.ts";

export type HcpSessionStatus = "active" | "closing" | "complete" | "archived" | "blocked" | "failed";
export type HcpTaskStatus = "active" | "closed" | "promoted" | "blocked" | "failed";
export type HcpTaskPhase = "discovering" | "implementing" | "stabilizing" | "close_ready";
export type HcpCriteriaStatus = "draft" | "provisional" | "frozen" | "superseded";
export type HcpDiscoveryDisposition = "required" | "follow_up" | "rejected";
export type HcpWorkItemStatus = "candidate" | "ready" | "active" | "done" | "blocked" | "deferred" | "cancelled" | "backlogged";

export interface HcpCriteriaRevision {
  version: number;
  status: HcpCriteriaStatus;
  criteria: string[];
  reason: string;
  changedAt: string;
  invalidatedWorkItemIds: string[];
  invalidatedEvidenceIds: string[];
}

export interface HcpTaskDiscovery {
  discoveryId: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  disposition: HcpDiscoveryDisposition;
  blocksCurrentTask: boolean;
  criterionIds: string[];
  evidence: string;
  rationale: string;
  discoveredAt: string;
}

export interface HcpLinkedIssue {
  hcpIssueId: string;
  provider: "github";
  number?: number;
  url?: string;
  title?: string;
}

export interface HcpLinkedPullRequest {
  hcpPrId: string;
  provider: "github";
  number?: number;
  url?: string;
  title?: string;
}

export interface HcpBacklogItem {
  hcpBacklogId: string;
  backlogId?: string;
  title: string;
  status: "open" | "closed";
  path?: string;
  note?: string;
  resolvedByTaskId?: string;
  resolvedByIssueNumber?: number;
  resolutionEvidence?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HcpWorkItemEvidence {
  status: HcpWorkItemStatus;
  reason: string;
  detail?: string;
  recordedAt: string;
}

export interface HcpWorkItem {
  workItemId: string;
  displayId: string;
  title: string;
  status: HcpWorkItemStatus;
  sourceTaskId?: string;
  parentId?: string;
  derivedFromId?: string;
  dependsOnIds: string[];
  backlogCandidateId?: string;
  resolutionTaskId?: string;
  backlogId?: string;
  backlogPath?: string;
  fingerprint?: string;
  evidence: HcpWorkItemEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface HcpWorkChangeSet {
  changeSetId: string;
  sourceCommand: "task_start" | "task_process" | "backlog_add";
  sourceTaskId?: string;
  sourceTurnId?: string;
  addedWorkItemIds: string[];
  updatedWorkItemIds: string[];
  reusedWorkItemIds: string[];
  excludedSuggestions: string[];
  recordedAt: string;
}

export interface HcpWorkFeedback {
  feedbackId: string;
  workItemId: string;
  title?: string;
  status?: HcpWorkItemStatus;
  parentId?: string;
  dependsOnIds?: string[];
  reason: string;
  statusOfFeedback: "pending" | "applied";
  recordedAt: string;
  appliedAt?: string;
  applyAttempts?: number;
  lastAttemptedAt?: string;
  lastApplyError?: string;
}

export interface HcpChangeLogEntry {
  changedAt: string;
  action: string;
  targetId: string;
  detail: string;
}

export interface HcpLifecyclePolicyEvidence {
  stage: HarnessStage;
  taskId?: string;
  outcome: "passed" | "blocked";
  evaluatedPolicies: PolicyResult[];
  recordedAt: string;
}

export interface HcpTaskCloseEvidence {
  source: "task_close";
  outcome: "passed" | "failed";
  completionSummary: string;
  verificationResult: string;
  outOfScope: string;
  remainingWork: string;
  recordedAt: string;
}

export interface HcpTaskProcessEvidence {
  status: PolicyRemediationLoopStatus;
  iterations: PolicyRemediationIteration[];
  nextAction?: string;
  recordedAt: string;
}

export interface HcpTaskRecoveryEvidence {
  failedAction: string;
  completedActions: string[];
  category: "network" | "authentication" | "api" | "command" | "unknown";
  retryable: boolean;
  failure: string;
  recoveryAction: string;
  recordedAt: string;
}

export interface HcpTaskState {
  taskId: string;
  taskName: string;
  status: HcpTaskStatus;
  issueNumber?: number;
  branchName?: string;
  scope?: string;
  outOfScope?: string;
  completionCriteria?: string;
  verificationMethod?: string;
  sourceBacklogIds?: string[];
  parentTaskId?: string;
  derivedFromTaskId?: string;
  dependsOnTaskIds?: string[];
  pullRequest?: HcpLinkedPullRequest;
  closeEvidence?: HcpTaskCloseEvidence;
  processEvidence?: HcpTaskProcessEvidence[];
  recoveryEvidence?: HcpTaskRecoveryEvidence[];
  loopIds?: string[];
  phase?: HcpTaskPhase;
  criteriaRevisions?: HcpCriteriaRevision[];
  discoveries?: HcpTaskDiscovery[];
  createdAt: string;
  updatedAt: string;
}

export interface RecordHcpCriteriaRevisionInput {
  sessionId: string;
  taskId: string;
  status: Exclude<HcpCriteriaStatus, "superseded">;
  criteria: string[];
  reason: string;
  invalidatedWorkItemIds?: string[];
  invalidatedEvidenceIds?: string[];
  phase?: HcpTaskPhase;
  now?: Date;
}

export interface RecordHcpTaskDiscoveryInput {
  sessionId: string;
  taskId: string;
  category: string;
  severity: HcpTaskDiscovery["severity"];
  disposition: HcpDiscoveryDisposition;
  blocksCurrentTask: boolean;
  criterionIds?: string[];
  evidence: string;
  rationale: string;
  now?: Date;
}

export interface UpdateHcpTaskDiscoveryInput {
  sessionId: string;
  taskId: string;
  discoveryId: string;
  disposition: HcpDiscoveryDisposition;
  blocksCurrentTask: boolean;
  evidence: string;
  rationale: string;
  now?: Date;
}

export interface HcpSessionState {
  sessionId: string;
  agentId: string;
  sessionNumber: string;
  sessionName: string;
  status: HcpSessionStatus;
  linkedIssue?: HcpLinkedIssue;
  backlogItems: HcpBacklogItem[];
  workItems?: HcpWorkItem[];
  workChangeSets?: HcpWorkChangeSet[];
  workFeedback?: HcpWorkFeedback[];
  tasks: HcpTaskState[];
  changeLog: HcpChangeLogEntry[];
  lifecyclePolicyEvidence?: HcpLifecyclePolicyEvidence[];
  createdAt: string;
  updatedAt: string;
  closingStartedAt?: string;
  completedAt?: string;
  archivedAt?: string;
}

export interface CreateHcpSessionInput {
  agentId?: string;
  sessionNumber?: string;
  sessionName?: string;
  now?: Date;
}

export interface UpdateHcpSessionInput {
  sessionId: string;
  sessionName?: string;
  linkedIssueNumber?: number;
  linkedIssueUrl?: string;
  linkedIssueTitle?: string;
  now?: Date;
}

export interface AddHcpTaskInput {
  agentId?: string;
  sessionId?: string;
  taskName: string;
  issueNumber?: number;
  branchName?: string;
  scope?: string;
  outOfScope?: string;
  completionCriteria?: string;
  verificationMethod?: string;
  sourceBacklogIds?: string[];
  parentTaskId?: string;
  derivedFromTaskId?: string;
  dependsOnTaskIds?: string[];
  now?: Date;
}

export interface UpdateHcpTaskRelationsInput {
  sessionId: string;
  taskId: string;
  parentTaskId?: string;
  derivedFromTaskId?: string;
  dependsOnTaskIds?: string[];
  reason: string;
  now?: Date;
}

export interface UpdateHcpTaskTitleInput {
  sessionId: string;
  taskId: string;
  taskName: string;
  now?: Date;
}

export interface UpdateHcpTaskBranchInput {
  sessionId: string;
  taskId: string;
  branchName: string;
  now?: Date;
}

export interface UpdateHcpTaskBoundaryInput {
  sessionId: string;
  taskId: string;
  scope: string;
  outOfScope: string;
  completionCriteria: string;
  verificationMethod: string;
  sourceBacklogIds?: string[];
  now?: Date;
}

export interface UpdateHcpTaskPullRequestInput {
  sessionId: string;
  taskId?: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  pullRequestTitle?: string;
  now?: Date;
}

export interface DeleteHcpTaskInput {
  sessionId: string;
  taskId: string;
  reason?: string;
  now?: Date;
}

export interface UpdateHcpTaskInput {
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  expectedStatus?: HcpTaskStatus;
  status: HcpTaskStatus;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  closeEvidence?: Omit<HcpTaskCloseEvidence, "recordedAt">;
  now?: Date;
}

export function linkHcpTaskLoop(repoRoot: string, sessionId: string, taskId: string, loopId: string, now = new Date()): HcpTaskState {
  const session = readSessionById(repoRoot, sessionId);
  const task = resolveTask(session, taskId, "active");
  if (!task.loopIds?.includes(loopId)) task.loopIds = [...(task.loopIds ?? []), loopId];
  const timestamp = now.toISOString(); task.updatedAt = timestamp; session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.link_loop", taskId, loopId); writeSessionState(repoRoot, session); return task;
}

export interface RecordHcpTaskProcessEvidenceInput {
  sessionId: string;
  taskId: string;
  status: PolicyRemediationLoopStatus;
  iterations: PolicyRemediationIteration[];
  nextAction?: string;
  now?: Date;
}

export interface RecordHcpTaskRecoveryEvidenceInput extends Omit<HcpTaskRecoveryEvidence, "recordedAt"> {
  sessionId: string;
  taskId: string;
  now?: Date;
}

export interface AddHcpBacklogInput {
  sessionId: string;
  title: string;
  backlogId?: string;
  path?: string;
  note?: string;
  now?: Date;
}

export interface UpdateHcpBacklogInput {
  sessionId: string;
  hcpBacklogId: string;
  title?: string;
  status?: "open" | "closed";
  backlogId?: string;
  path?: string;
  note?: string;
  now?: Date;
}

export interface DeleteHcpBacklogInput {
  sessionId: string;
  hcpBacklogId: string;
  reason?: string;
  now?: Date;
}

export interface AddHcpWorkItemInput {
  sessionId: string;
  title: string;
  status?: HcpWorkItemStatus;
  sourceTaskId?: string;
  parentId?: string;
  derivedFromId?: string;
  dependsOnIds?: string[];
  reason?: string;
  detail?: string;
  now?: Date;
}

export interface UpdateHcpWorkItemInput {
  sessionId: string;
  workItemId: string;
  title?: string;
  status?: HcpWorkItemStatus;
  parentId?: string;
  derivedFromId?: string;
  dependsOnIds?: string[];
  reason?: string;
  detail?: string;
  resolutionTaskId?: string;
  backlogId?: string;
  backlogPath?: string;
  now?: Date;
}

export interface SyncHcpSessionWorkInput {
  sessionId: string;
  sourceCommand: HcpWorkChangeSet["sourceCommand"];
  sourceTaskId?: string;
  sourceTurnId?: string;
  items: Array<{ title: string; status: HcpWorkItemStatus; reason: string; detail?: string; parentId?: string; dependsOnIds?: string[] }>;
  excludedSuggestions?: string[];
  now?: Date;
}

export interface RecordHcpWorkFeedbackInput {
  sessionId: string;
  workItemId: string;
  title?: string;
  status?: HcpWorkItemStatus;
  parentId?: string;
  dependsOnIds?: string[];
  reason: string;
  now?: Date;
}

export interface HcpStateSummary {
  selectedSession?: HcpSessionState;
  activeSessions: HcpSessionState[];
  completeSessions: HcpSessionState[];
  archivedSessions: HcpSessionState[];
  blockedSessions: HcpSessionState[];
  failedSessions: HcpSessionState[];
  detail: string;
}

export interface CleanupArchivedSessionsInput {
  olderThanDays?: number;
  keep?: number;
  now?: Date;
  dryRun?: boolean;
}

export interface CleanupArchivedSessionsResult {
  deleted: HcpSessionState[];
  kept: HcpSessionState[];
}

const statuses: HcpSessionStatus[] = ["active", "closing", "complete", "archived", "blocked", "failed"];

export function createHcpSession(repoRoot: string, input: CreateHcpSessionInput = {}): HcpSessionState {
  archiveCompleteSessions(repoRoot, input.now);
  const agentId = normalizeIdPart(input.agentId ?? "codex");
  const sessionNumber = normalizeSessionNumber(input.sessionNumber);
  const sessionName = input.sessionName?.trim() ?? "";
  if (!sessionName) {
    throw new Error("HCP session name is required");
  }
  const duplicate = listSessionStates(repoRoot)
    .find((session) => session.status === "active"
      && session.agentId === agentId
      && normalizeSessionName(session.sessionName) === normalizeSessionName(sessionName));
  if (duplicate) {
    throw new Error(`Active HCP session already exists for agentId + sessionName: ${duplicate.sessionId}`);
  }
  const now = input.now ?? new Date();
  const sequence = nextSessionSequence(repoRoot, agentId, sessionNumber, now);
  const sessionId = `${agentId}_ses_${sessionNumber}_${dateStamp(now)}_${sequence}`;
  const timestamp = now.toISOString();
  const session: HcpSessionState = {
    sessionId,
    agentId,
    sessionNumber,
    sessionName,
    status: "active",
    backlogItems: [],
    tasks: [],
    changeLog: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  writeSessionState(repoRoot, session);
  return session;
}

export function updateHcpSession(repoRoot: string, input: UpdateHcpSessionInput): HcpSessionState {
  const session = readSessionById(repoRoot, input.sessionId);
  const timestamp = (input.now ?? new Date()).toISOString();
  if (input.sessionName !== undefined) {
    const previous = session.sessionName;
    session.sessionName = input.sessionName.trim();
    appendChange(session, timestamp, "session.update_name", session.sessionId, `${previous} -> ${session.sessionName}`);
  }
  if (input.linkedIssueNumber || input.linkedIssueUrl) {
    session.linkedIssue = {
      hcpIssueId: session.linkedIssue?.hcpIssueId ?? `${session.agentId}_issue_${session.sessionNumber}_001`,
      provider: "github",
      number: input.linkedIssueNumber ?? session.linkedIssue?.number,
      url: input.linkedIssueUrl ?? session.linkedIssue?.url,
      title: input.linkedIssueTitle ?? session.linkedIssue?.title
    };
    appendChange(session, timestamp, "session.link_issue", session.sessionId, `issue #${session.linkedIssue.number ?? ""}`);
  }
  if (input.linkedIssueTitle !== undefined && session.linkedIssue) {
    const previous = session.linkedIssue.title ?? "";
    session.linkedIssue.title = input.linkedIssueTitle;
    appendChange(session, timestamp, "session.update_issue_title", session.sessionId, `${previous} -> ${input.linkedIssueTitle}`);
  }
  session.updatedAt = timestamp;
  writeSessionState(repoRoot, session);
  return session;
}

export function archiveCompleteSessions(repoRoot: string, now: Date = new Date()): HcpSessionState[] {
  return listSessionStates(repoRoot)
    .filter((session) => session.status === "complete")
    .map((session) => transitionHcpSessionStatus(repoRoot, session.sessionId, "archived", now));
}

export function updateHcpTaskTitle(repoRoot: string, input: UpdateHcpTaskTitleInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId);
  const timestamp = (input.now ?? new Date()).toISOString();
  const previous = task.taskName;
  task.taskName = input.taskName;
  task.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.update_name", task.taskId, `${previous} -> ${task.taskName}`);
  writeSessionState(repoRoot, session);
  return task;
}

export function updateHcpTaskBranch(repoRoot: string, input: UpdateHcpTaskBranchInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId);
  const timestamp = (input.now ?? new Date()).toISOString();
  const previous = task.branchName ?? "";
  task.branchName = input.branchName;
  task.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.update_branch", task.taskId, `${previous} -> ${task.branchName}`);
  writeSessionState(repoRoot, session);
  return task;
}

export function updateHcpTaskBoundary(repoRoot: string, input: UpdateHcpTaskBoundaryInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId, "active");
  const timestamp = (input.now ?? new Date()).toISOString();
  task.scope = input.scope;
  task.outOfScope = input.outOfScope;
  task.completionCriteria = input.completionCriteria;
  task.verificationMethod = input.verificationMethod;
  if (input.sourceBacklogIds) task.sourceBacklogIds = [...new Set(input.sourceBacklogIds)];
  task.updatedAt = timestamp;
  session.updatedAt = timestamp;
  if (!session.changeLog.some((entry) => entry.action === "task.add" && entry.targetId === task.taskId)) {
    appendChange(session, task.createdAt, "task.add", task.taskId, task.taskName);
  }
  appendChange(session, timestamp, "task.update_boundary", task.taskId, "scope, outOfScope, completionCriteria, verificationMethod, sourceBacklogIds");
  writeSessionState(repoRoot, session);
  return task;
}

export function updateHcpTaskPullRequest(repoRoot: string, input: UpdateHcpTaskPullRequestInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = input.taskId
    ? resolveTask(session, input.taskId)
    : resolveTaskByPullRequest(session, input.pullRequestNumber);
  const timestamp = (input.now ?? new Date()).toISOString();
  task.pullRequest = {
    hcpPrId: task.pullRequest?.hcpPrId ?? `${session.agentId}_pr_${session.sessionNumber}_${nextPullRequestSequence(session)}`,
    provider: "github",
    number: input.pullRequestNumber ?? task.pullRequest?.number,
    url: input.pullRequestUrl ?? task.pullRequest?.url,
    title: input.pullRequestTitle ?? task.pullRequest?.title
  };
  task.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.update_pr", task.taskId, `pr #${task.pullRequest.number ?? ""}`);
  writeSessionState(repoRoot, session);
  return task;
}

export function deleteHcpTask(repoRoot: string, input: DeleteHcpTaskInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId);
  if (task.status !== "active") {
    throw new Error(`Only active HCP tasks can be deleted: ${task.taskId}`);
  }
  const timestamp = (input.now ?? new Date()).toISOString();
  session.tasks = session.tasks.filter((candidate) => candidate.taskId !== task.taskId);
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.delete", task.taskId, input.reason ?? "deleted before task close");
  writeSessionState(repoRoot, session);
  return task;
}

export function addHcpBacklog(repoRoot: string, input: AddHcpBacklogInput): HcpBacklogItem {
  const session = readSessionById(repoRoot, input.sessionId);
  const timestamp = (input.now ?? new Date()).toISOString();
  const item: HcpBacklogItem = {
    hcpBacklogId: `${session.agentId}_blg_${session.sessionNumber}_${nextBacklogSequence(session)}`,
    backlogId: input.backlogId,
    title: input.title,
    status: "open",
    path: input.path,
    note: input.note,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  session.backlogItems.push(item);
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "backlog.add", item.hcpBacklogId, item.title);
  writeSessionState(repoRoot, session);
  return item;
}

export function updateHcpBacklog(repoRoot: string, input: UpdateHcpBacklogInput): HcpBacklogItem {
  const session = readSessionById(repoRoot, input.sessionId);
  const item = resolveBacklog(session, input.hcpBacklogId);
  const timestamp = (input.now ?? new Date()).toISOString();
  if (input.title !== undefined) {
    item.title = input.title;
  }
  if (input.status !== undefined) {
    item.status = input.status;
  }
  if (input.backlogId !== undefined) {
    item.backlogId = input.backlogId;
  }
  if (input.path !== undefined) {
    item.path = input.path;
  }
  if (input.note !== undefined) {
    item.note = input.note;
  }
  item.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "backlog.update", item.hcpBacklogId, item.title);
  writeSessionState(repoRoot, session);
  return item;
}

export function deleteHcpBacklog(repoRoot: string, input: DeleteHcpBacklogInput): HcpBacklogItem {
  const session = readSessionById(repoRoot, input.sessionId);
  const item = resolveBacklog(session, input.hcpBacklogId);
  const timestamp = (input.now ?? new Date()).toISOString();
  session.backlogItems = session.backlogItems.filter((candidate) => candidate.hcpBacklogId !== item.hcpBacklogId);
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "backlog.delete", item.hcpBacklogId, input.reason ?? item.title);
  writeSessionState(repoRoot, session);
  return item;
}

export function addHcpWorkItem(repoRoot: string, input: AddHcpWorkItemInput): HcpWorkItem {
  const session = readSessionById(repoRoot, input.sessionId);
  if (session.status !== "active") throw new Error(`HCP session cannot add work items in status ${session.status}`);
  const workItems = session.workItems ?? [];
  validateWorkItemLinks(session, undefined, input.sourceTaskId, input.parentId, input.derivedFromId, input.dependsOnIds ?? []);
  const timestamp = (input.now ?? new Date()).toISOString();
  const workItemId = `${session.agentId}_work_${session.sessionNumber}_${String(workItems.length + 1).padStart(3, "0")}`;
  const status = input.status ?? "candidate";
  const item: HcpWorkItem = {
    workItemId,
    displayId: nextWorkItemDisplayId(session, input.sourceTaskId, input.parentId),
    title: requiredText(input.title, "Work item title"),
    status,
    sourceTaskId: input.sourceTaskId,
    parentId: input.parentId,
    derivedFromId: input.derivedFromId,
    dependsOnIds: uniqueStrings(input.dependsOnIds ?? []),
    backlogCandidateId: isBacklogCandidateStatus(status) ? `candidate:${workItemId}` : undefined,
    evidence: [{ status, reason: input.reason?.trim() || "work item registered", detail: input.detail?.trim() || undefined, recordedAt: timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  validateWorkItemStatusTransition(repoRoot, session, item, status, {
    sessionId: session.sessionId,
    workItemId,
    status,
    reason: input.reason,
    detail: input.detail
  });
  session.workItems = [...workItems, item];
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "work_item.add", item.workItemId, `${item.displayId} ${item.title}`);
  writeSessionState(repoRoot, session);
  return item;
}

export function updateHcpWorkItem(repoRoot: string, input: UpdateHcpWorkItemInput): HcpWorkItem {
  const session = readSessionById(repoRoot, input.sessionId);
  if (session.status !== "active") throw new Error(`HCP session cannot update work items in status ${session.status}`);
  const item = resolveWorkItem(session, input.workItemId);
  const parentId = input.parentId ?? item.parentId;
  const derivedFromId = input.derivedFromId ?? item.derivedFromId;
  const dependsOnIds = input.dependsOnIds ?? item.dependsOnIds;
  validateWorkItemLinks(session, item.workItemId, item.sourceTaskId, parentId, derivedFromId, dependsOnIds);
  const timestamp = (input.now ?? new Date()).toISOString();
  const metadataChanged = input.title !== undefined || input.parentId !== undefined || input.derivedFromId !== undefined
    || input.dependsOnIds !== undefined || input.resolutionTaskId !== undefined || input.backlogId !== undefined || input.backlogPath !== undefined;
  if (input.title !== undefined) item.title = requiredText(input.title, "Work item title");
  if (input.parentId !== undefined) item.parentId = input.parentId;
  if (input.derivedFromId !== undefined) item.derivedFromId = input.derivedFromId;
  if (input.dependsOnIds !== undefined) item.dependsOnIds = uniqueStrings(input.dependsOnIds);
  if (input.resolutionTaskId !== undefined) {
    if (!session.tasks.some((task) => task.taskId === input.resolutionTaskId)) throw new Error(`HCP resolution task not found: ${input.resolutionTaskId}`);
    item.resolutionTaskId = input.resolutionTaskId;
  }
  if (input.backlogId !== undefined) item.backlogId = requiredText(input.backlogId, "Backlog id");
  if (input.backlogPath !== undefined) item.backlogPath = requiredText(input.backlogPath, "Backlog path");
  if (input.status && input.status !== item.status) {
    validateWorkItemStatusTransition(repoRoot, session, item, input.status, input);
    item.status = input.status;
    item.evidence.push({
      status: input.status,
      reason: requiredText(input.reason, "Work item status change reason"),
      detail: input.detail?.trim() || undefined,
      recordedAt: timestamp
    });
    if (isBacklogCandidateStatus(input.status)) item.backlogCandidateId ??= `candidate:${item.workItemId}`;
  } else if (metadataChanged) {
    item.evidence.push({
      status: item.status,
      reason: requiredText(input.reason, "Work item change reason"),
      detail: input.detail?.trim() || "work item metadata updated",
      recordedAt: timestamp
    });
  }
  item.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "work_item.update", item.workItemId, `${item.displayId} [${item.status}]`);
  writeSessionState(repoRoot, session);
  return item;
}

export function listHcpBacklogCandidates(session: HcpSessionState): HcpWorkItem[] {
  return (session.workItems ?? []).filter((item) => isBacklogCandidateStatus(item.status));
}

export function listHcpUnfinishedWorkItems(session: HcpSessionState): HcpWorkItem[] {
  return (session.workItems ?? []).filter((item) => !isTerminalWorkItemStatus(item.status));
}

export function syncHcpSessionWorkItems(repoRoot: string, input: SyncHcpSessionWorkInput): HcpWorkChangeSet {
  const session = readSessionById(repoRoot, input.sessionId);
  if (session.status !== "active") throw new Error(`HCP session cannot sync work items in status ${session.status}`);
  const timestamp = (input.now ?? new Date()).toISOString();
  const addedWorkItemIds: string[] = [];
  const updatedWorkItemIds: string[] = [];
  const reusedWorkItemIds: string[] = [];
  for (const proposal of input.items) {
    const fingerprint = workItemFingerprint(input.sourceTaskId, proposal.title, proposal.parentId);
    const existing = (session.workItems ?? []).find((item) => (item.fingerprint ?? workItemFingerprint(item.sourceTaskId, item.title, item.parentId)) === fingerprint);
    if (!existing) {
      validateWorkItemLinks(session, undefined, input.sourceTaskId, proposal.parentId, undefined, proposal.dependsOnIds ?? []);
      const workItemId = `${session.agentId}_work_${session.sessionNumber}_${String((session.workItems?.length ?? 0) + 1).padStart(3, "0")}`;
      const added: HcpWorkItem = {
        workItemId,
        displayId: nextWorkItemDisplayId(session, input.sourceTaskId, proposal.parentId),
        title: requiredText(proposal.title, "Work item title"),
        status: proposal.status,
        sourceTaskId: input.sourceTaskId,
        parentId: proposal.parentId,
        dependsOnIds: uniqueStrings(proposal.dependsOnIds ?? []),
        backlogCandidateId: isBacklogCandidateStatus(proposal.status) ? `candidate:${workItemId}` : undefined,
        fingerprint,
        evidence: [{ status: proposal.status, reason: requiredText(proposal.reason, "Work item reason"), detail: proposal.detail?.trim() || undefined, recordedAt: timestamp }],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      validateWorkItemStatusTransition(repoRoot, session, added, proposal.status, { sessionId: input.sessionId, workItemId, status: proposal.status, reason: proposal.reason, detail: proposal.detail });
      session.workItems = [...(session.workItems ?? []), added];
      appendChange(session, timestamp, "work_item.add", added.workItemId, `${added.displayId} ${added.title}`);
      addedWorkItemIds.push(added.workItemId);
      continue;
    }
    if (existing.status !== proposal.status) {
      validateWorkItemStatusTransition(repoRoot, session, existing, proposal.status, { sessionId: input.sessionId, workItemId: existing.workItemId, status: proposal.status, reason: proposal.reason, detail: proposal.detail });
      existing.status = proposal.status;
      existing.updatedAt = timestamp;
      existing.evidence.push({ status: proposal.status, reason: requiredText(proposal.reason, "Work item status change reason"), detail: proposal.detail?.trim() || undefined, recordedAt: timestamp });
      if (isBacklogCandidateStatus(proposal.status)) existing.backlogCandidateId ??= `candidate:${existing.workItemId}`;
      appendChange(session, timestamp, "work_item.update", existing.workItemId, `${existing.displayId} [${existing.status}]`);
      updatedWorkItemIds.push(existing.workItemId);
    } else {
      reusedWorkItemIds.push(existing.workItemId);
    }
  }
  const sequence = (session.workChangeSets?.length ?? 0) + 1;
  const changeSet: HcpWorkChangeSet = {
    changeSetId: `SWP-${session.sessionNumber}-${String(sequence).padStart(3, "0")}`,
    sourceCommand: input.sourceCommand,
    sourceTaskId: input.sourceTaskId,
    sourceTurnId: input.sourceTurnId,
    addedWorkItemIds,
    updatedWorkItemIds,
    reusedWorkItemIds,
    excludedSuggestions: uniqueStrings(input.excludedSuggestions ?? []),
    recordedAt: timestamp
  };
  session.workChangeSets = [...(session.workChangeSets ?? []), changeSet];
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "work_item.sync_response", changeSet.changeSetId, `${input.sourceCommand}: added=${addedWorkItemIds.length}, updated=${updatedWorkItemIds.length}, reused=${reusedWorkItemIds.length}`);
  writeSessionState(repoRoot, session);
  return changeSet;
}

export function requireHcpWorkChangeSetAfter(
  repoRoot: string,
  sessionId: string,
  sourceCommand: HcpWorkChangeSet["sourceCommand"],
  previousCount: number,
  sourceTaskId?: string
): HcpWorkChangeSet {
  const session = readSessionById(repoRoot, sessionId);
  const changeSets = session.workChangeSets ?? [];
  if (changeSets.length !== previousCount + 1) {
    throw new Error(`HCP response work change set missing: ${sourceCommand}`);
  }
  const changeSet = changeSets.at(-1)!;
  if (changeSet.sourceCommand !== sourceCommand || changeSet.sourceTaskId !== sourceTaskId) {
    throw new Error(`HCP response work change set mismatch: expected ${sourceCommand}/${sourceTaskId ?? "session"}`);
  }
  return changeSet;
}

export function buildHcpWorkChangeResponse(session: HcpSessionState, changeSet: HcpWorkChangeSet): string {
  const byId = (id: string): HcpWorkItem | undefined => (session.workItems ?? []).find((item) => item.workItemId === id);
  let graph = buildHcpWorkItemGraph(session);
  for (const id of changeSet.addedWorkItemIds) {
    const item = byId(id);
    if (item) graph = graph.replace(`- ${item.displayId} [`, `- [NEW] ${item.displayId} [`);
  }
  const mermaid = buildHcpWorkItemMermaid(session);
  return [
    "## 이번 응답의 세션 작업 변경",
    "",
    `- change set: ${changeSet.changeSetId}`,
    `- source: ${changeSet.sourceCommand}`,
    `- 신규 등록: ${changeSet.addedWorkItemIds.map((id) => byId(id)?.displayId ?? id).join(", ") || "none"}`,
    `- 상태 변경: ${changeSet.updatedWorkItemIds.map((id) => byId(id)?.displayId ?? id).join(", ") || "none"}`,
    `- 기존 재사용: ${changeSet.reusedWorkItemIds.map((id) => byId(id)?.displayId ?? id).join(", ") || "none"}`,
    `- 등록 제외: ${changeSet.excludedSuggestions.join(", ") || "none"}`,
    "",
    graph,
    "",
    mermaid
  ].join("\n");
}

export function recordHcpWorkFeedback(repoRoot: string, input: RecordHcpWorkFeedbackInput): HcpWorkFeedback {
  const session = readSessionById(repoRoot, input.sessionId);
  resolveWorkItem(session, input.workItemId);
  if (input.title === undefined && input.status === undefined && input.parentId === undefined && input.dependsOnIds === undefined) {
    throw new Error("Work item feedback requires at least one correction field");
  }
  const timestamp = (input.now ?? new Date()).toISOString();
  const feedback: HcpWorkFeedback = {
    feedbackId: `SWF-${session.sessionNumber}-${String((session.workFeedback?.length ?? 0) + 1).padStart(3, "0")}`,
    workItemId: input.workItemId,
    title: input.title,
    status: input.status,
    parentId: input.parentId,
    dependsOnIds: input.dependsOnIds,
    reason: requiredText(input.reason, "Work item feedback reason"),
    statusOfFeedback: "pending",
    recordedAt: timestamp
  };
  session.workFeedback = [...(session.workFeedback ?? []), feedback];
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "work_item.feedback_pending", feedback.feedbackId, `${feedback.workItemId}: ${feedback.reason}`);
  writeSessionState(repoRoot, session);
  return feedback;
}

export function applyPendingHcpWorkFeedback(repoRoot: string, sessionId: string, now = new Date()): HcpWorkFeedback[] {
  const original = readSessionById(repoRoot, sessionId);
  const session = structuredClone(original);
  if (session.status !== "active") throw new Error(`HCP session cannot apply work feedback in status ${session.status}`);
  const pending = (session.workFeedback ?? []).filter((feedback) => feedback.statusOfFeedback === "pending");
  if (!pending.length) return [];
  const timestamp = now.toISOString();
  // Apply every correction to an in-memory candidate first. Any validation error
  // aborts before the single state write, so pending feedback remains untouched.
  try {
  for (const feedback of pending) {
    const item = resolveWorkItem(session, feedback.workItemId);
    const parentId = feedback.parentId ?? item.parentId;
    const dependsOnIds = feedback.dependsOnIds ?? item.dependsOnIds;
    validateWorkItemLinks(session, item.workItemId, item.sourceTaskId, parentId, item.derivedFromId, dependsOnIds);
    if (feedback.status && feedback.status !== item.status) validateWorkItemStatusTransition(repoRoot, session, item, feedback.status, {
      sessionId,
      workItemId: item.workItemId,
      status: feedback.status,
      reason: feedback.reason
    });
    if (feedback.title !== undefined) item.title = requiredText(feedback.title, "Work item title");
    if (feedback.parentId !== undefined) item.parentId = feedback.parentId;
    if (feedback.dependsOnIds !== undefined) item.dependsOnIds = uniqueStrings(feedback.dependsOnIds);
    if (feedback.status && feedback.status !== item.status) {
      item.status = feedback.status;
      if (isBacklogCandidateStatus(feedback.status)) item.backlogCandidateId ??= `candidate:${item.workItemId}`;
    }
    item.evidence.push({
      status: item.status,
      reason: feedback.reason,
      detail: `applied feedback ${feedback.feedbackId}`,
      recordedAt: timestamp
    });
    item.updatedAt = timestamp;
    feedback.statusOfFeedback = "applied";
    feedback.appliedAt = timestamp;
    feedback.applyAttempts = (feedback.applyAttempts ?? 0) + 1;
    feedback.lastAttemptedAt = timestamp;
    delete feedback.lastApplyError;
    appendChange(session, timestamp, "work_item.update", item.workItemId, `${item.displayId} [${item.status}]`);
    appendChange(session, timestamp, "work_item.feedback_applied", feedback.feedbackId, feedback.workItemId);
  }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const feedback of original.workFeedback?.filter((candidate) => candidate.statusOfFeedback === "pending") ?? []) {
      feedback.applyAttempts = (feedback.applyAttempts ?? 0) + 1;
      feedback.lastAttemptedAt = timestamp;
      feedback.lastApplyError = message;
    }
    original.updatedAt = timestamp;
    appendChange(original, timestamp, "work_item.feedback_apply_failed", sessionId, message);
    writeSessionState(repoRoot, original);
    throw error;
  }
  session.updatedAt = timestamp;
  writeSessionState(repoRoot, session);
  return pending;
}

export function buildHcpWorkItemGraph(session: HcpSessionState): string {
  const items = session.workItems ?? [];
  const lines = ["## Session Task and Work Item Graph", ""];
  const append = (item: HcpWorkItem, depth: number): void => {
    const relations = [
      item.dependsOnIds.length ? `depends: ${item.dependsOnIds.join(", ")}` : "",
      item.derivedFromId ? `derived: ${item.derivedFromId}` : "",
      item.backlogCandidateId && isBacklogCandidateStatus(item.status) ? `backlog-candidate: ${item.backlogCandidateId}` : ""
    ].filter(Boolean);
    lines.push(`${"  ".repeat(depth)}- ${item.displayId} [${item.status}] ${item.title}${relations.length ? ` (${relations.join("; ")})` : ""}`);
    items.filter((candidate) => candidate.parentId === item.workItemId).forEach((child) => append(child, depth + 1));
  };
  session.tasks.forEach((task, index) => {
    const relations = [
      task.dependsOnTaskIds?.length ? `depends: ${task.dependsOnTaskIds.join(", ")}` : "",
      task.derivedFromTaskId ? `derived: ${task.derivedFromTaskId}` : ""
    ].filter(Boolean);
    lines.push(`- T${index + 1} [${task.status}] ${task.taskName}${relations.length ? ` (${relations.join("; ")})` : ""}`);
    items.filter((item) => item.sourceTaskId === task.taskId && !item.parentId).forEach((item) => append(item, 1));
  });
  items.filter((item) => !item.sourceTaskId && !item.parentId).forEach((item) => append(item, 0));
  if (session.tasks.length === 0 && items.length === 0) lines.push("- none");
  return lines.join("\n");
}

export function buildHcpWorkItemMermaid(session: HcpSessionState): string {
  const items = session.workItems ?? [];
  const lines = ["```mermaid", "flowchart TD"];
  session.tasks.forEach((task, index) => lines.push(`  task_${index + 1}["T${index + 1} [${task.status}] ${escapeMermaid(task.taskName)}"]`));
  session.tasks.forEach((task, index) => {
    const parentIndex = session.tasks.findIndex((candidate) => candidate.taskId === task.parentTaskId);
    const derivedIndex = session.tasks.findIndex((candidate) => candidate.taskId === task.derivedFromTaskId);
    if (parentIndex >= 0) lines.push(`  task_${parentIndex + 1} --> task_${index + 1}`);
    if (derivedIndex >= 0) lines.push(`  task_${derivedIndex + 1} -. derived .-> task_${index + 1}`);
    (task.dependsOnTaskIds ?? []).forEach((dependencyId) => {
      const dependencyIndex = session.tasks.findIndex((candidate) => candidate.taskId === dependencyId);
      if (dependencyIndex >= 0) lines.push(`  task_${dependencyIndex + 1} -. depends .-> task_${index + 1}`);
    });
  });
  items.forEach((item, index) => lines.push(`  work_${index + 1}["${item.displayId} [${item.status}] ${escapeMermaid(item.title)}"]`));
  items.forEach((item, index) => {
    const taskIndex = session.tasks.findIndex((task) => task.taskId === item.sourceTaskId);
    const parentIndex = items.findIndex((candidate) => candidate.workItemId === item.parentId);
    if (parentIndex >= 0) lines.push(`  work_${parentIndex + 1} --> work_${index + 1}`);
    else if (taskIndex >= 0) lines.push(`  task_${taskIndex + 1} --> work_${index + 1}`);
    item.dependsOnIds.forEach((dependencyId) => {
      const dependencyIndex = items.findIndex((candidate) => candidate.workItemId === dependencyId);
      if (dependencyIndex >= 0) lines.push(`  work_${dependencyIndex + 1} -. depends .-> work_${index + 1}`);
    });
    if (item.derivedFromId) {
      const derivedIndex = items.findIndex((candidate) => candidate.workItemId === item.derivedFromId);
      if (derivedIndex >= 0) lines.push(`  work_${derivedIndex + 1} -. derived .-> work_${index + 1}`);
    }
  });
  lines.push("```");
  return lines.join("\n");
}

export function addHcpTask(repoRoot: string, input: AddHcpTaskInput): HcpTaskState {
  const session = resolveActiveSession(repoRoot, input.sessionId, input.agentId);
  const now = input.now ?? new Date();
  const taskId = `${normalizeIdPart(input.agentId ?? session.agentId)}_task_${session.sessionNumber}_${nextTaskSequence(session)}`;
  const timestamp = now.toISOString();
  validateTaskLinks(session, undefined, input.parentTaskId, input.derivedFromTaskId, input.dependsOnTaskIds ?? []);
  const task: HcpTaskState = {
    taskId,
    taskName: input.taskName,
    status: "active",
    issueNumber: input.issueNumber,
    branchName: input.branchName,
    scope: input.scope,
    outOfScope: input.outOfScope,
    completionCriteria: input.completionCriteria,
    verificationMethod: input.verificationMethod,
    sourceBacklogIds: input.sourceBacklogIds,
    parentTaskId: input.parentTaskId,
    derivedFromTaskId: input.derivedFromTaskId,
    dependsOnTaskIds: uniqueStrings(input.dependsOnTaskIds ?? []),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (input.issueNumber && !session.linkedIssue) {
    session.linkedIssue = {
      hcpIssueId: `${normalizeIdPart(input.agentId ?? session.agentId)}_issue_${session.sessionNumber}_001`,
      provider: "github",
      number: input.issueNumber
    };
  }
  session.tasks.push(task);
  appendChange(session, timestamp, "task.add", task.taskId, task.taskName);
  session.updatedAt = timestamp;
  writeSessionState(repoRoot, session);
  return task;
}

export function updateHcpTask(repoRoot: string, input: UpdateHcpTaskInput): HcpTaskState {
  const session = resolveTaskSession(repoRoot, input);
  const task = resolveTask(session, input.taskId, input.expectedStatus);
  const timestamp = (input.now ?? new Date()).toISOString();
  task.status = input.status;
  task.updatedAt = timestamp;
  if (input.pullRequestNumber || input.pullRequestUrl) {
    task.pullRequest = {
      hcpPrId: task.pullRequest?.hcpPrId ?? `${normalizeIdPart(input.agentId ?? session.agentId)}_pr_${session.sessionNumber}_${nextPullRequestSequence(session)}`,
      provider: "github",
      number: input.pullRequestNumber ?? task.pullRequest?.number,
      url: input.pullRequestUrl ?? task.pullRequest?.url,
      title: task.pullRequest?.title
    };
  }
  if (input.closeEvidence) {
    task.closeEvidence = {
      ...input.closeEvidence,
      recordedAt: timestamp
    };
    appendChange(session, timestamp, "task.record_close_evidence", task.taskId, `${task.closeEvidence.outcome}: ${task.closeEvidence.verificationResult}`);
  }
  session.updatedAt = timestamp;
  writeSessionState(repoRoot, session);
  return task;
}

export function updateHcpTaskRelations(repoRoot: string, input: UpdateHcpTaskRelationsInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  if (session.status !== "active") throw new Error(`HCP session cannot update task relations in status ${session.status}`);
  const task = resolveTask(session, input.taskId);
  const parentTaskId = input.parentTaskId ?? task.parentTaskId;
  const derivedFromTaskId = input.derivedFromTaskId ?? task.derivedFromTaskId;
  const dependsOnTaskIds = input.dependsOnTaskIds ?? task.dependsOnTaskIds ?? [];
  validateTaskLinks(session, task.taskId, parentTaskId, derivedFromTaskId, dependsOnTaskIds);
  task.parentTaskId = parentTaskId;
  task.derivedFromTaskId = derivedFromTaskId;
  task.dependsOnTaskIds = uniqueStrings(dependsOnTaskIds);
  const timestamp = (input.now ?? new Date()).toISOString();
  task.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.update_relations", task.taskId, requiredText(input.reason, "Task relation change reason"));
  writeSessionState(repoRoot, session);
  return task;
}

export function recordHcpTaskProcessEvidence(repoRoot: string, input: RecordHcpTaskProcessEvidenceInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId, "active");
  const timestamp = (input.now ?? new Date()).toISOString();
  task.processEvidence = [
    ...(task.processEvidence ?? []),
    {
      status: input.status,
      iterations: input.iterations,
      nextAction: input.nextAction,
      recordedAt: timestamp
    }
  ];
  task.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.record_process_evidence", task.taskId, `${input.status}: iterations=${input.iterations.length}`);
  writeSessionState(repoRoot, session);
  return task;
}

export function recordHcpTaskRecoveryEvidence(repoRoot: string, input: RecordHcpTaskRecoveryEvidenceInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId, "active");
  const timestamp = (input.now ?? new Date()).toISOString();
  task.recoveryEvidence = [...(task.recoveryEvidence ?? []), {
    failedAction: input.failedAction,
    completedActions: input.completedActions,
    category: input.category,
    retryable: input.retryable,
    failure: input.failure,
    recoveryAction: input.recoveryAction,
    recordedAt: timestamp
  }];
  task.updatedAt = timestamp;
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.record_recovery_evidence", task.taskId, `${input.failedAction}: ${input.category}; retryable=${input.retryable}`);
  writeSessionState(repoRoot, session);
  return task;
}

export function resolveHcpSourceBacklogs(repoRoot: string, input: {
  sourceBacklogIds: string[];
  taskId: string;
  issueNumber?: number;
  verificationResult: string;
  now?: Date;
}): HcpBacklogItem[] {
  const ids = new Set(input.sourceBacklogIds);
  if (ids.size === 0) return [];
  const timestamp = (input.now ?? new Date()).toISOString();
  const resolved: HcpBacklogItem[] = [];
  for (const session of listSessionStates(repoRoot)) {
    let changed = false;
    for (const item of session.backlogItems.filter((candidate) => ids.has(candidate.hcpBacklogId))) {
      item.status = "closed";
      item.resolvedByTaskId = input.taskId;
      item.resolvedByIssueNumber = input.issueNumber;
      item.resolutionEvidence = input.verificationResult;
      item.resolvedAt = timestamp;
      item.updatedAt = timestamp;
      appendChange(session, timestamp, "backlog.resolve", item.hcpBacklogId, `${input.taskId}; issue #${input.issueNumber ?? ""}; ${input.verificationResult}`);
      resolved.push(item);
      changed = true;
    }
    if (changed) {
      session.updatedAt = timestamp;
      writeSessionState(repoRoot, session);
    }
  }
  const missing = [...ids].filter((id) => !resolved.some((item) => item.hcpBacklogId === id));
  if (missing.length) throw new Error(`Source HCP backlog not found: ${missing.join(", ")}`);
  return resolved;
}

export function recordHcpLifecyclePolicyEvidence(repoRoot: string, input: {
  sessionId: string;
  taskId?: string;
  stage: HarnessStage;
  outcome: "passed" | "blocked";
  evaluatedPolicies: PolicyResult[];
  now?: Date;
}): HcpSessionState {
  const session = readSessionById(repoRoot, input.sessionId);
  const timestamp = (input.now ?? new Date()).toISOString();
  session.lifecyclePolicyEvidence = [...(session.lifecyclePolicyEvidence ?? []), {
    stage: input.stage,
    taskId: input.taskId,
    outcome: input.outcome,
    evaluatedPolicies: input.evaluatedPolicies,
    recordedAt: timestamp
  }];
  session.updatedAt = timestamp;
  appendChange(session, timestamp, "policy.evaluate", input.taskId ?? session.sessionId, `${input.stage}:${input.outcome}`);
  writeSessionState(repoRoot, session);
  return session;
}

export function getHcpTaskPhase(task: HcpTaskState): HcpTaskPhase {
  return task.phase ?? "implementing";
}

export function transitionHcpTaskPhase(repoRoot: string, sessionId: string, taskId: string, phase: HcpTaskPhase, now = new Date()): HcpTaskState {
  const session = readSessionById(repoRoot, sessionId);
  const task = resolveTask(session, taskId, "active");
  const current = getHcpTaskPhase(task);
  if (current === phase) return task;
  const transitions: Record<HcpTaskPhase, HcpTaskPhase[]> = {
    discovering: ["implementing"],
    implementing: ["discovering", "stabilizing"],
    stabilizing: ["discovering", "implementing", "close_ready"],
    close_ready: ["discovering", "stabilizing"]
  };
  if (!transitions[current].includes(phase)) throw new Error(`Invalid task phase transition: ${current} -> ${phase}`);
  const currentCriteria = task.criteriaRevisions?.findLast((revision) => revision.status !== "superseded");
  if (phase === "implementing" && task.criteriaRevisions?.length && !["provisional", "frozen"].includes(currentCriteria?.status ?? "")) {
    throw new Error("Task implementation requires provisional or frozen completion criteria");
  }
  if (phase === "close_ready") {
    const readiness = evaluateHcpTaskCloseReadiness(task);
    if (!readiness.ready) throw new Error(`Task is not close-ready: ${readiness.reasons.join("; ")}`);
  }
  const timestamp = now.toISOString(); task.phase = phase; task.updatedAt = timestamp; session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.transition_phase", task.taskId, `${current} -> ${phase}`);
  writeSessionState(repoRoot, session); return task;
}

export function recordHcpCriteriaRevision(repoRoot: string, input: RecordHcpCriteriaRevisionInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId, "active");
  const criteria = input.criteria.map((criterion) => criterion.trim()).filter(Boolean);
  if (!criteria.length) throw new Error("Completion criteria are required");
  if (!input.reason.trim()) throw new Error("Criteria revision reason is required");
  const revisions = task.criteriaRevisions ?? [];
  const current = revisions.findLast((revision) => revision.status !== "superseded");
  const invalidatedWorkItemIds = [...new Set(input.invalidatedWorkItemIds ?? [])];
  const invalidatedEvidenceIds = [...new Set(input.invalidatedEvidenceIds ?? [])];
  if (current?.status === "frozen" && !invalidatedWorkItemIds.length && !invalidatedEvidenceIds.length) {
    throw new Error("Revising frozen criteria requires explicit evidence or work item invalidation");
  }
  if (current) current.status = "superseded";
  const timestamp = (input.now ?? new Date()).toISOString();
  revisions.push({
    version: Math.max(0, ...revisions.map((revision) => revision.version)) + 1,
    status: input.status,
    criteria,
    reason: input.reason.trim(),
    changedAt: timestamp,
    invalidatedWorkItemIds,
    invalidatedEvidenceIds
  });
  task.criteriaRevisions = revisions;
  task.phase = input.phase ?? (input.status === "draft" ? "discovering" : input.status === "frozen" ? "stabilizing" : "implementing");
  if (task.closeEvidence) {
    invalidatedEvidenceIds.push(`task-close:${task.closeEvidence.recordedAt}`);
    delete task.closeEvidence;
  }
  task.updatedAt = timestamp; session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.revise_completion_criteria", task.taskId, `v${revisions.at(-1)!.version} ${input.status}: ${input.reason.trim()}`);
  writeSessionState(repoRoot, session); return task;
}

export function recordHcpTaskDiscovery(repoRoot: string, input: RecordHcpTaskDiscoveryInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId, "active");
  if (!input.category.trim() || !input.evidence.trim() || !input.rationale.trim()) throw new Error("Discovery category, evidence and rationale are required");
  if (input.disposition !== "required" && input.blocksCurrentTask) throw new Error(`${input.disposition} discovery cannot block the current task`);
  const timestamp = (input.now ?? new Date()).toISOString();
  const discoveries = task.discoveries ?? [];
  discoveries.push({
    discoveryId: `${task.taskId}_discovery_${String(discoveries.length + 1).padStart(3, "0")}`,
    category: input.category.trim(), severity: input.severity, disposition: input.disposition,
    blocksCurrentTask: input.blocksCurrentTask, criterionIds: [...new Set(input.criterionIds ?? [])],
    evidence: input.evidence.trim(), rationale: input.rationale.trim(), discoveredAt: timestamp
  });
  task.discoveries = discoveries;
  if (input.blocksCurrentTask) task.phase = "discovering";
  task.updatedAt = timestamp; session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.record_discovery", task.taskId, `${input.disposition}: ${input.category.trim()}`);
  writeSessionState(repoRoot, session); return task;
}

export function updateHcpTaskDiscovery(repoRoot: string, input: UpdateHcpTaskDiscoveryInput): HcpTaskState {
  const session = readSessionById(repoRoot, input.sessionId);
  const task = resolveTask(session, input.taskId, "active");
  const discovery = task.discoveries?.find((candidate) => candidate.discoveryId === input.discoveryId);
  if (!discovery) throw new Error(`HCP task discovery not found: ${input.discoveryId}`);
  if (!input.evidence.trim() || !input.rationale.trim()) throw new Error("Discovery update evidence and rationale are required");
  if (input.disposition !== "required" && input.blocksCurrentTask) throw new Error(`${input.disposition} discovery cannot block the current task`);
  const timestamp = (input.now ?? new Date()).toISOString();
  discovery.disposition = input.disposition; discovery.blocksCurrentTask = input.blocksCurrentTask;
  discovery.evidence = input.evidence.trim(); discovery.rationale = input.rationale.trim();
  task.updatedAt = timestamp; session.updatedAt = timestamp;
  appendChange(session, timestamp, "task.update_discovery", discovery.discoveryId, `${input.disposition}: blocks=${input.blocksCurrentTask}`);
  writeSessionState(repoRoot, session); return task;
}

export function evaluateHcpTaskCloseReadiness(task: HcpTaskState): { ready: boolean; reasons: string[] } {
  const revisions = task.criteriaRevisions ?? [];
  if (!revisions.length) return { ready: true, reasons: ["legacy task: structured criteria not present"] };
  const current = revisions.findLast((revision) => revision.status !== "superseded");
  const reasons: string[] = [];
  if (current?.status !== "frozen") reasons.push("completion criteria are not frozen");
  if ((task.discoveries ?? []).some((discovery) => discovery.disposition === "required" && discovery.blocksCurrentTask)) reasons.push("unresolved required discovery remains");
  return { ready: reasons.length === 0, reasons };
}

export function buildHcpSessionHandoff(session: HcpSessionState): string {
  const promotedTasks = session.tasks.filter((task) => task.status === "promoted");
  const activeTasks = session.tasks.filter((task) => task.status === "active");
  const closedTasks = session.tasks.filter((task) => task.status === "closed");
  const openBacklog = session.backlogItems.filter((item) => item.status === "open");
  const workItems = session.workItems ?? [];
  const unfinishedWorkItems = workItems.filter((item) => !isTerminalWorkItemStatus(item.status));
  const backlogCandidates = listHcpBacklogCandidates(session);
  const next = openBacklog.length > 0
    ? `Next backlog: ${openBacklog.map((item) => item.backlogId ? `${item.backlogId} ${item.title}` : item.title).join("; ")}`
    : "Next backlog: none recorded in HCP state";
  return [
    `Session ${session.sessionName || session.sessionId} is closing.`,
    `Completed tasks: ${promotedTasks.length > 0 ? promotedTasks.map((task) => `${task.taskId} ${task.taskName}`).join("; ") : "none recorded"}.`,
    `Unfinished tasks: ${[...activeTasks, ...closedTasks].length > 0 ? [...activeTasks, ...closedTasks].map((task) => `${task.taskId} ${task.status}`).join("; ") : "none"}.`,
    `Linked issue: ${session.linkedIssue?.number ? `#${session.linkedIssue.number}` : "none"}.`,
    `Session work items: ${workItems.filter((item) => item.status === "done").length} done; ${unfinishedWorkItems.length} unfinished.`,
    `Backlog conversion candidates: ${backlogCandidates.length > 0 ? backlogCandidates.map((item) => `${item.backlogCandidateId} ${item.displayId}`).join("; ") : "none"}.`,
    next
  ].join(" ");
}

export function buildHcpSessionRetrospectiveSummary(session: HcpSessionState): string {
  const backlogCandidates = listHcpBacklogCandidates(session);
  return [
    "## HCP Session State",
    "",
    `- Session ID: ${session.sessionId}`,
    `- Agent ID: ${session.agentId}`,
    `- Session number: ${session.sessionNumber}`,
    `- Session status at snapshot: ${session.status}`,
    ...(session.status === "closing" ? ["- Session final status after successful #세션정리: complete"] : []),
    ...(session.completedAt ? [`- Session completed at: ${session.completedAt}`] : []),
    ...(session.archivedAt ? [`- Session archived at: ${session.archivedAt}`] : []),
    `- Linked issue: ${session.linkedIssue?.number ? `#${session.linkedIssue.number}` : "none"}`,
    `- Tasks: ${session.tasks.length}`,
    ...session.tasks.map((task) => `  - ${task.taskId} [${task.status}] ${task.taskName}`),
    `- Backlog items: ${session.backlogItems.length}`,
    ...session.backlogItems.map((item) => `  - ${item.hcpBacklogId} [${item.status}] ${item.title}`),
    "",
    buildHcpWorkItemGraph(session),
    "",
    buildHcpWorkItemMermaid(session),
    "",
    `- Backlog conversion candidates: ${backlogCandidates.length}`,
    ...backlogCandidates.map((item) => `  - ${item.backlogCandidateId} ${item.displayId} [${item.status}] ${item.title}`),
    ""
  ].join("\n");
}

export function cleanupArchivedSessions(repoRoot: string, input: CleanupArchivedSessionsInput = {}): CleanupArchivedSessionsResult {
  const now = input.now ?? new Date();
  const keep = input.keep ?? 20;
  const olderThanDays = input.olderThanDays ?? 90;
  const archived = listSessionStates(repoRoot)
    .filter((session) => session.status === "archived")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const keptByCount = new Set(archived.slice(0, keep).map((session) => session.sessionId));
  const cutoff = now.getTime() - olderThanDays * 24 * 60 * 60 * 1000;
  const deleted = archived.filter((session) => {
    if (keptByCount.has(session.sessionId)) {
      return false;
    }
    const archivedAt = Date.parse(session.archivedAt ?? session.updatedAt);
    return Number.isFinite(archivedAt) && archivedAt < cutoff;
  });
  if (!input.dryRun) {
    for (const session of deleted) {
      const filePath = sessionPath(repoRoot, "archived", session.sessionId);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  }
  return {
    deleted,
    kept: archived.filter((session) => !deleted.some((deletedSession) => deletedSession.sessionId === session.sessionId))
  };
}

export function transitionHcpSessionStatus(
  repoRoot: string,
  sessionId: string,
  status: HcpSessionStatus,
  now: Date = new Date()
): HcpSessionState {
  const session = readSessionById(repoRoot, sessionId);
  const previousPath = sessionPath(repoRoot, session.status, session.sessionId);
  const timestamp = now.toISOString();
  session.status = status;
  session.updatedAt = timestamp;
  if (status === "closing") {
    session.closingStartedAt = timestamp;
  }
  if (status === "complete") {
    session.completedAt = timestamp;
  }
  if (status === "archived") {
    session.archivedAt = timestamp;
  }
  const nextPath = sessionPath(repoRoot, status, session.sessionId);
  mkdirSync(dirname(nextPath), { recursive: true });
  writeFileSync(nextPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  if (previousPath !== nextPath && existsSync(previousPath)) {
    unlinkSync(previousPath);
  }
  return session;
}

export function readSessionById(repoRoot: string, sessionId: string): HcpSessionState {
  const found = listSessionStates(repoRoot).find((session) => session.sessionId === sessionId);
  if (!found) {
    throw new Error(`HCP session not found: ${sessionId}`);
  }
  return found;
}

export function listSessionStates(repoRoot: string): HcpSessionState[] {
  const root = sessionsRoot(repoRoot);
  const result: HcpSessionState[] = [];
  for (const status of statuses) {
    const directory = join(root, status);
    if (!existsSync(directory)) {
      continue;
    }
    for (const file of listJsonFiles(directory)) {
      result.push(JSON.parse(readFileSync(file, "utf8")) as HcpSessionState);
    }
  }
  return result.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function buildHcpStateSummary(repoRoot: string, selectedSessionId?: string): HcpStateSummary {
  const sessions = listSessionStates(repoRoot);
  const activeSessions = sessions.filter((session) => session.status === "active");
  const completeSessions = sessions.filter((session) => session.status === "complete");
  const archivedSessions = sessions.filter((session) => session.status === "archived");
  const blockedSessions = sessions.filter((session) => session.status === "blocked");
  const failedSessions = sessions.filter((session) => session.status === "failed");
  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.sessionId === selectedSessionId)
    : activeSessions.length === 1 ? activeSessions[0] : undefined;
  return {
    selectedSession,
    activeSessions,
    completeSessions,
    archivedSessions,
    blockedSessions,
    failedSessions,
    detail: [
      `active sessions: ${activeSessions.length}`,
      `complete sessions: ${completeSessions.length}`,
      `archived sessions: ${archivedSessions.length}`,
      `blocked sessions: ${blockedSessions.length}`,
      `failed sessions: ${failedSessions.length}`,
      selectedSession ? `selected session: ${selectedSession.sessionId}` : "selected session: none"
    ].join("; ")
  };
}

export function resolveActiveSession(repoRoot: string, sessionId?: string, agentId = "codex"): HcpSessionState {
  const sessions = listSessionStates(repoRoot);
  if (sessionId) {
    const session = sessions.find((candidate) => candidate.sessionId === sessionId);
    if (!session) {
      throw new Error(`HCP session not found: ${sessionId}`);
    }
    if (session.status !== "active") {
      throw new Error(`HCP session is not active: ${sessionId}`);
    }
    return session;
  }

  const active = sessions.filter((session) => session.status === "active" && session.agentId === normalizeIdPart(agentId));
  if (active.length === 1) {
    return active[0];
  }
  if (active.length === 0) {
    throw new Error("No active HCP session found");
  }
  throw new Error(`Multiple active HCP sessions found: ${active.map((session) => session.sessionId).join(", ")}`);
}

function resolveTaskSession(repoRoot: string, input: UpdateHcpTaskInput): HcpSessionState {
  const session = input.sessionId
    ? readSessionById(repoRoot, input.sessionId)
    : resolveActiveSession(repoRoot, undefined, input.agentId);
  if (!["active", "closing"].includes(session.status)) {
    throw new Error(`HCP session cannot update task in status ${session.status}: ${session.sessionId}`);
  }
  return session;
}

function resolveTask(session: HcpSessionState, taskId?: string, expectedStatus?: HcpTaskStatus): HcpTaskState {
  if (taskId) {
    const task = session.tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) {
      throw new Error(`HCP task not found: ${taskId}`);
    }
    return task;
  }

  const candidates = expectedStatus
    ? session.tasks.filter((task) => task.status === expectedStatus)
    : session.tasks;
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    throw new Error(`No HCP task candidate found in session ${session.sessionId}`);
  }
  throw new Error(`Multiple HCP task candidates found: ${candidates.map((task) => task.taskId).join(", ")}`);
}

function resolveTaskByPullRequest(session: HcpSessionState, pullRequestNumber?: number): HcpTaskState {
  const candidates = session.tasks.filter((task) => pullRequestNumber
    ? task.pullRequest?.number === pullRequestNumber
    : Boolean(task.pullRequest));
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    throw new Error(`No HCP pull request candidate found in session ${session.sessionId}`);
  }
  throw new Error(`Multiple HCP pull request candidates found: ${candidates.map((task) => task.taskId).join(", ")}`);
}

function resolveBacklog(session: HcpSessionState, hcpBacklogId: string): HcpBacklogItem {
  const item = session.backlogItems.find((candidate) => candidate.hcpBacklogId === hcpBacklogId);
  if (!item) {
    throw new Error(`HCP backlog item not found: ${hcpBacklogId}`);
  }
  return item;
}

function resolveWorkItem(session: HcpSessionState, workItemId: string): HcpWorkItem {
  const item = (session.workItems ?? []).find((candidate) => candidate.workItemId === workItemId);
  if (!item) throw new Error(`HCP work item not found: ${workItemId}`);
  return item;
}

function validateTaskLinks(session: HcpSessionState, taskId: string | undefined, parentTaskId: string | undefined, derivedFromTaskId: string | undefined, dependsOnTaskIds: string[]): void {
  const resolveLinkedTask = (linkedId: string): HcpTaskState => {
    const linked = session.tasks.find((task) => task.taskId === linkedId);
    if (!linked) throw new Error(`HCP linked task not found: ${linkedId}`);
    return linked;
  };
  for (const linkedId of [parentTaskId, derivedFromTaskId, ...dependsOnTaskIds].filter((value): value is string => Boolean(value))) {
    if (linkedId === taskId) throw new Error(`HCP task cannot reference itself: ${linkedId}`);
    resolveLinkedTask(linkedId);
  }
  if (taskId && parentTaskId) {
    let cursor: string | undefined = parentTaskId;
    while (cursor) {
      if (cursor === taskId) throw new Error(`HCP task parent cycle detected: ${taskId}`);
      cursor = resolveLinkedTask(cursor).parentTaskId;
    }
  }
  if (taskId) {
    const reaches = (candidateId: string, visited = new Set<string>()): boolean => {
      if (candidateId === taskId) return true;
      if (visited.has(candidateId)) return false;
      visited.add(candidateId);
      return (resolveLinkedTask(candidateId).dependsOnTaskIds ?? []).some((dependencyId) => reaches(dependencyId, visited));
    };
    if (dependsOnTaskIds.some((dependencyId) => reaches(dependencyId))) throw new Error(`HCP task dependency cycle detected: ${taskId}`);
  }
}

function validateWorkItemLinks(
  session: HcpSessionState,
  workItemId: string | undefined,
  sourceTaskId: string | undefined,
  parentId: string | undefined,
  derivedFromId: string | undefined,
  dependsOnIds: string[]
): void {
  if (sourceTaskId && !session.tasks.some((task) => task.taskId === sourceTaskId)) throw new Error(`HCP source task not found: ${sourceTaskId}`);
  for (const linkedId of [parentId, derivedFromId, ...dependsOnIds].filter((value): value is string => Boolean(value))) {
    if (linkedId === workItemId) throw new Error(`HCP work item cannot reference itself: ${linkedId}`);
    resolveWorkItem(session, linkedId);
  }
  if (workItemId && parentId) {
    let cursor: string | undefined = parentId;
    while (cursor) {
      if (cursor === workItemId) throw new Error(`HCP work item parent cycle detected: ${workItemId}`);
      cursor = resolveWorkItem(session, cursor).parentId;
    }
  }
  if (workItemId) {
    const reaches = (candidateId: string, visited = new Set<string>()): boolean => {
      if (candidateId === workItemId) return true;
      if (visited.has(candidateId)) return false;
      visited.add(candidateId);
      return resolveWorkItem(session, candidateId).dependsOnIds.some((dependencyId) => reaches(dependencyId, visited));
    };
    if (dependsOnIds.some((dependencyId) => reaches(dependencyId))) throw new Error(`HCP work item dependency cycle detected: ${workItemId}`);
  }
}

function nextWorkItemDisplayId(session: HcpSessionState, sourceTaskId?: string, parentId?: string): string {
  const items = session.workItems ?? [];
  if (parentId) {
    const parent = resolveWorkItem(session, parentId);
    const sibling = items.filter((item) => item.parentId === parentId).length + 1;
    return `${parent.displayId}.${sibling}`;
  }
  if (sourceTaskId) {
    const taskIndex = session.tasks.findIndex((task) => task.taskId === sourceTaskId) + 1;
    const sibling = items.filter((item) => item.sourceTaskId === sourceTaskId && !item.parentId).length + 1;
    return `T${taskIndex}.${sibling}`;
  }
  return `S${items.filter((item) => !item.sourceTaskId && !item.parentId).length + 1}`;
}

function isBacklogCandidateStatus(status: HcpWorkItemStatus): boolean {
  return ["candidate", "blocked", "deferred"].includes(status);
}

function isTerminalWorkItemStatus(status: HcpWorkItemStatus): boolean {
  return ["done", "cancelled", "backlogged"].includes(status);
}

function validateWorkItemStatusTransition(
  repoRoot: string,
  session: HcpSessionState,
  item: HcpWorkItem,
  status: HcpWorkItemStatus,
  input: UpdateHcpWorkItemInput
): void {
  if (["active", "done"].includes(status)) {
    const unfinishedDependencies = item.dependsOnIds
      .map((dependencyId) => resolveWorkItem(session, dependencyId))
      .filter((dependency) => !isTerminalWorkItemStatus(dependency.status));
    if (unfinishedDependencies.length > 0) throw new Error(`HCP work item dependencies are unfinished: ${unfinishedDependencies.map((dependency) => dependency.workItemId).join(", ")}`);
  }
  if (status === "done" && (input.resolutionTaskId ?? item.resolutionTaskId)) {
    const resolutionTaskId = input.resolutionTaskId ?? item.resolutionTaskId;
    const resolutionTask = session.tasks.find((task) => task.taskId === resolutionTaskId);
    if (resolutionTask?.status !== "promoted") throw new Error(`HCP resolution task is not promoted: ${resolutionTaskId}`);
  }
  if (status === "backlogged" && !(input.backlogId ?? item.backlogId) && !(input.backlogPath ?? item.backlogPath)) {
    throw new Error("Backlogged work item requires backlog id or path evidence");
  }
  if (status === "backlogged") {
    const backlogId = input.backlogId ?? item.backlogId;
    const backlogPath = input.backlogPath ?? item.backlogPath;
    if (!backlogPath || !existsSync(join(repoRoot, backlogPath))) throw new Error(`Backlog document evidence not found: ${backlogPath ?? "missing path"}`);
    const indexPath = join(repoRoot, "docs", "15.로그", "backlog", "README.md");
    if (!existsSync(indexPath) || !hasBacklogIndexEntry(readFileSync(indexPath, "utf8"), { backlogId, path: backlogPath })) {
      throw new Error(`Backlog index evidence not found: ${backlogId ?? backlogPath}`);
    }
    const marker = item.backlogCandidateId ?? `candidate:${item.workItemId}`;
    if (!readFileSync(join(repoRoot, backlogPath), "utf8").includes(marker)) throw new Error(`Backlog source marker not found: ${marker}`);
  }
}

function escapeMermaid(value: string): string {
  return value.replace(/["\n\r]/g, " ").trim();
}

function requiredText(value: string | undefined, label: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function workItemFingerprint(sourceTaskId: string | undefined, title: string, parentId: string | undefined): string {
  return [sourceTaskId ?? "session", parentId ?? "root", title.trim().toLowerCase().replace(/\s+/g, " ")].join("|");
}

function writeSessionState(repoRoot: string, session: HcpSessionState): void {
  const filePath = sessionPath(repoRoot, session.status, session.sessionId);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function sessionsRoot(repoRoot: string): string {
  return join(repoRoot, ".hcp", "sessions");
}

function sessionPath(repoRoot: string, status: HcpSessionStatus, sessionId: string): string {
  return join(sessionsRoot(repoRoot), status, `${sessionId}.json`);
}

function listJsonFiles(directory: string): string[] {
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(directory, entry.name))
    : [];
}

function nextSessionSequence(repoRoot: string, agentId: string, sessionNumber: string, now: Date): string {
  const prefix = `${agentId}_ses_${sessionNumber}_${dateStamp(now)}_`;
  const numbers = listSessionStates(repoRoot)
    .map((session) => session.sessionId)
    .filter((sessionId) => sessionId.startsWith(prefix))
    .map((sessionId) => Number(sessionId.slice(prefix.length)))
    .filter(Number.isFinite);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return String(next).padStart(3, "0");
}

function nextTaskSequence(session: HcpSessionState): string {
  const next = session.tasks.length + 1;
  return String(next).padStart(3, "0");
}

function nextPullRequestSequence(session: HcpSessionState): string {
  const used = session.tasks.filter((task) => task.pullRequest).length + 1;
  return String(used).padStart(3, "0");
}

function nextBacklogSequence(session: HcpSessionState): string {
  return String(session.backlogItems.length + 1).padStart(3, "0");
}

function appendChange(session: HcpSessionState, changedAt: string, action: string, targetId: string, detail: string): void {
  session.changeLog.push({ changedAt, action, targetId, detail });
}

function normalizeSessionNumber(value?: string): string {
  if (!value) {
    return "manual";
  }
  return /^\d{1,3}$/.test(value) ? value.padStart(3, "0") : normalizeIdPart(value);
}

function normalizeIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "manual";
}

function normalizeSessionName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function dateStamp(value: Date): string {
  return value.toISOString().slice(0, 10).replace(/-/g, "");
}
