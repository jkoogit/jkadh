import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PolicyRemediationIteration, PolicyRemediationLoopStatus } from "../gates/policy-remediation-loop.ts";
import type { HarnessStage, PolicyResult } from "../gates/stage-policy.ts";

export type HcpSessionStatus = "active" | "closing" | "complete" | "archived" | "blocked" | "failed";
export type HcpTaskStatus = "active" | "closed" | "promoted" | "blocked" | "failed";
export type HcpTaskPhase = "discovering" | "implementing" | "stabilizing" | "close_ready";
export type HcpCriteriaStatus = "draft" | "provisional" | "frozen" | "superseded";
export type HcpDiscoveryDisposition = "required" | "follow_up" | "rejected";

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

export function addHcpTask(repoRoot: string, input: AddHcpTaskInput): HcpTaskState {
  const session = resolveActiveSession(repoRoot, input.sessionId, input.agentId);
  const now = input.now ?? new Date();
  const taskId = `${normalizeIdPart(input.agentId ?? session.agentId)}_task_${session.sessionNumber}_${nextTaskSequence(session)}`;
  const timestamp = now.toISOString();
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
  const next = openBacklog.length > 0
    ? `Next backlog: ${openBacklog.map((item) => item.backlogId ? `${item.backlogId} ${item.title}` : item.title).join("; ")}`
    : "Next backlog: none recorded in HCP state";
  return [
    `Session ${session.sessionName || session.sessionId} is closing.`,
    `Completed tasks: ${promotedTasks.length > 0 ? promotedTasks.map((task) => `${task.taskId} ${task.taskName}`).join("; ") : "none recorded"}.`,
    `Unfinished tasks: ${[...activeTasks, ...closedTasks].length > 0 ? [...activeTasks, ...closedTasks].map((task) => `${task.taskId} ${task.status}`).join("; ") : "none"}.`,
    `Linked issue: ${session.linkedIssue?.number ? `#${session.linkedIssue.number}` : "none"}.`,
    next
  ].join(" ");
}

export function buildHcpSessionRetrospectiveSummary(session: HcpSessionState): string {
  return [
    "## HCP Session State",
    "",
    `- Session ID: ${session.sessionId}`,
    `- Agent ID: ${session.agentId}`,
    `- Session number: ${session.sessionNumber}`,
    `- Session status: ${session.status}`,
    `- Linked issue: ${session.linkedIssue?.number ? `#${session.linkedIssue.number}` : "none"}`,
    `- Tasks: ${session.tasks.length}`,
    ...session.tasks.map((task) => `  - ${task.taskId} [${task.status}] ${task.taskName}`),
    `- Backlog items: ${session.backlogItems.length}`,
    ...session.backlogItems.map((item) => `  - ${item.hcpBacklogId} [${item.status}] ${item.title}`),
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
