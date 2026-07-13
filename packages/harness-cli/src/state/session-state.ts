import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type HcpSessionStatus = "active" | "closing" | "complete" | "archived" | "blocked" | "failed";
export type HcpTaskStatus = "active" | "closed" | "promoted" | "blocked" | "failed";

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
  createdAt: string;
  updatedAt: string;
}

export interface HcpChangeLogEntry {
  changedAt: string;
  action: string;
  targetId: string;
  detail: string;
}

export interface HcpTaskState {
  taskId: string;
  taskName: string;
  status: HcpTaskStatus;
  issueNumber?: number;
  branchName?: string;
  pullRequest?: HcpLinkedPullRequest;
  createdAt: string;
  updatedAt: string;
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
  session.updatedAt = timestamp;
  writeSessionState(repoRoot, session);
  return task;
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
