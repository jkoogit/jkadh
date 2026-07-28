import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { countUnresolvedBacklogEntries } from "../docs/backlog-index.ts";
import { checkGate, type HarnessAction } from "../gates/check-gate.ts";
import { evaluateStagePolicies, policiesPassed, type PolicyResult } from "../gates/stage-policy.ts";
import { createReportDocument } from "../reports/create-report.ts";
import { classifyGitHubCommandFailure, type GitHubFailureCategory } from "../github/command-failure.ts";
import { buildHcpSessionHandoff, buildHcpSessionRetrospectiveSummary, clearHcpSessionCloseCheckpoint, listHcpUnfinishedWorkItems, readSessionById, recordHcpSessionCloseCheckpoint, resolveActiveSession, transitionHcpSessionStatus, type HcpSessionCloseCheckpoint, type HcpSessionState } from "../state/session-state.ts";

export type RelatedIssueDecision = "closed" | "close" | "keep" | "handoff";

export interface SessionCloseRelatedIssue {
  number: number;
  sources: string[];
  state?: "OPEN" | "CLOSED" | "UNKNOWN";
  decision?: RelatedIssueDecision;
  reason?: string;
  followUp?: string;
  title?: string;
  url?: string;
}

export interface SessionCloseInput {
  agentId?: string;
  sessionId?: string;
  completedTasks: string[];
  sessionNumber?: string;
  sessionName?: string;
  issueUpdate?: string;
  remainingWork?: string;
  autoStatus?: SessionCloseAutoStatus;
  stateBlockers?: string[];
  workItemDecisions?: Array<{ workItemId: string; displayId: string; status: string; title: string; backlogCandidateId?: string }>;
  retrospective?: string;
  retrospectiveDocument?: string;
  retrospectiveDeferredReason?: string;
  hcpRetrospectiveSummary?: string;
  handoff?: string;
  unresolvedDocs: string[];
  verifiedIssueNumbers: number[];
  relatedIssues?: SessionCloseRelatedIssue[];
  issueSettlementBlockers?: string[];
  recoveryCheckpoint?: HcpSessionCloseCheckpoint;
  execution?: SessionCloseExecutionOptions;
}

export interface SessionCloseExecutionOptions {
  enabled: boolean;
  paths: string[];
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
  relatedIssueNumber?: number;
  issueTitle?: string;
  issueBody?: string;
  issueComment?: string;
  baseBranch: string;
  mergePr: boolean;
  promote: boolean;
  reuseOpenPr: boolean;
  targetBranches: string[];
}

export interface SessionCloseAutoStatus {
  lookupStatus: "available" | "unavailable";
  remainingWork?: string;
  branchAlignment?: string;
  detail: string;
}

export interface SessionCloseReport {
  command: "session close";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    input: SessionCloseInput;
    missing: string[];
    decisionRequired: string[];
    issueCloseReady: boolean;
    appliedPolicies: PolicySummary[];
    scopeDecision: ScopeDecisionSummary;
    policyResults: PolicyResult[];
  };
  blockedActions: string[];
}

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): string;
}

export interface SessionCloseStateStore {
  recordCheckpoint: typeof recordHcpSessionCloseCheckpoint;
  clearCheckpoint: typeof clearHcpSessionCloseCheckpoint;
  completeState: typeof completeSessionCloseState;
}

export interface SessionCloseExecutionResult {
  status: "executed" | "blocked" | "skipped";
  markdown: string;
  steps: {
    action: HarnessAction;
    status: "executed" | "blocked" | "skipped";
    detail: string;
  }[];
  recovery?: SessionCloseRecoveryState;
}

interface PolicySummary {
  id: string;
  decision: "applied" | "not_applicable";
  summary: string;
}

interface ScopeDecisionSummary {
  scope: "session_close";
  decision: "allowed" | "blocked";
  summary: string;
}

export interface SessionCloseRecoveryState {
  branch?: string;
  createdCommit: boolean;
  pushedBranch: boolean;
  failedAction?: HarnessAction;
  failure?: string;
  failureCategory?: GitHubFailureCategory;
  retryable?: boolean;
  recoveryAction?: string;
  completedActions?: HarnessAction[];
  completedIssueSettlements?: number[];
  retrospectiveDocument?: string;
  pullRequestNumber?: number;
  promotedCommit?: string;
  targetBranches?: string[];
  relatedIssues?: SessionCloseRelatedIssue[];
  sessionStatus?: "active";
}

const blockedActions = ["write_retrospective", "update_issue", "commit_changes", "push_branch", "create_pr", "merge_pr", "promote_branch", "close_issue"];
const executionActions: HarnessAction[] = ["write_retrospective", "update_issue", "commit_changes", "push_branch", "create_pr", "merge_pr", "promote_branch", "close_issue"];
const retrospectiveDirectoryName = "12.\uD68C\uACE0";
const retrospectiveLabel = "\uD68C\uACE0";
const defaultSessionRetrospectiveTitle = "\uC138\uC158\uC815\uB9AC \uD68C\uACE0";
const requiredRetrospectiveCloseMarkers = [
  "Session status at snapshot: closing",
  "Session final status after successful #\uC138\uC158\uC815\uB9AC: complete"
] as const;

export function parseSessionCloseArgs(args: string[]): SessionCloseInput {
  const input: SessionCloseInput = {
    completedTasks: [],
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  };
  const execution: SessionCloseExecutionOptions = {
    enabled: false,
    paths: [],
    baseBranch: "dev",
    mergePr: true,
    promote: true,
    reuseOpenPr: false,
    targetBranches: ["stg", "main"]
  };

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key) {
      continue;
    }
    if (key === "--execute") {
      execution.enabled = true;
      continue;
    }
    if (key === "--no-merge") {
      execution.mergePr = false;
      continue;
    }
    if (key === "--no-promote") {
      execution.promote = false;
      continue;
    }
    if (key === "--reuse-open-pr") {
      execution.reuseOpenPr = true;
      continue;
    }
    if (isSessionNumberToken(key)) {
      input.sessionNumber = normalizeSessionNumber(key);
      continue;
    }

    const value = args[index + 1];
    if (!value) {
      continue;
    }
    if (key === "--session-number") {
      input.sessionNumber = normalizeSessionNumber(value);
      index += 1;
    }
    if (key === "--agent-id") {
      input.agentId = value;
      index += 1;
    }
    if (key === "--session-id") {
      input.sessionId = value;
      index += 1;
    }
    if (key === "--completed-task") {
      input.completedTasks.push(value);
      index += 1;
    }
    if (key === "--completed-tasks") {
      input.completedTasks.push(...splitList(value));
      index += 1;
    }
    if (key === "--session-name") {
      input.sessionName = value;
      index += 1;
    }
    if (key === "--issue-update") {
      input.issueUpdate = value;
      index += 1;
    }
    if (key === "--remaining") {
      input.remainingWork = value;
      index += 1;
    }
    if (key === "--retrospective") {
      input.retrospective = value;
      index += 1;
    }
    if (key === "--retrospective-doc") {
      input.retrospectiveDocument = value;
      index += 1;
    }
    if (key === "--retrospective-deferred") {
      input.retrospectiveDeferredReason = value;
      index += 1;
    }
    if (key === "--handoff") {
      input.handoff = value;
      index += 1;
    }
    if (key === "--unresolved-doc") {
      input.unresolvedDocs.push(value);
      index += 1;
    }
    if (key === "--verified-issue") {
      const issueNumber = Number(value.replace(/^#/, ""));
      if (Number.isFinite(issueNumber)) {
        input.verifiedIssueNumbers.push(issueNumber);
      }
      index += 1;
    }
    if (key === "--keep-issue" || key === "--handoff-issue") {
      const decision = key === "--keep-issue" ? "keep" : "handoff";
      const issue = parseIssueDecision(value, decision);
      if (issue) input.relatedIssues = mergeRelatedIssues(input.relatedIssues ?? [], [issue]);
      index += 1;
    }
    if (key === "--path") {
      execution.paths.push(value);
      index += 1;
    }
    if (key === "--paths") {
      execution.paths.push(...splitList(value));
      index += 1;
    }
    if (key === "--message") {
      execution.commitMessage = value;
      index += 1;
    }
    if (key === "--pr-title") {
      execution.prTitle = value;
      index += 1;
    }
    if (key === "--pr-body") {
      execution.prBody = value;
      index += 1;
    }
    if (key === "--related-issue") {
      const issueNumber = Number(value.replace(/^#/, ""));
      if (Number.isFinite(issueNumber)) {
        execution.relatedIssueNumber = issueNumber;
      }
      index += 1;
    }
    if (key === "--issue-title") {
      execution.issueTitle = value;
      index += 1;
    }
    if (key === "--issue-body") {
      execution.issueBody = value;
      index += 1;
    }
    if (key === "--issue-comment") {
      execution.issueComment = value;
      index += 1;
    }
    if (key === "--base") {
      execution.baseBranch = value;
      index += 1;
    }
    if (key === "--target-branches") {
      execution.targetBranches = splitList(value);
      index += 1;
    }
    if (key === "--target-branch") {
      execution.targetBranches.push(value);
      index += 1;
    }
  }

  if (execution.enabled
    || execution.paths.length > 0
    || execution.commitMessage
    || execution.prTitle
    || execution.prBody
    || execution.relatedIssueNumber
    || execution.issueTitle
    || execution.issueBody
    || execution.issueComment) {
    input.execution = execution;
  }

  return input;
}

export function buildSessionCloseReport(input: SessionCloseInput): SessionCloseReport {
  const missing = missingFields(input);
  const policyResults = evaluateStagePolicies("session_close", {
    noUnfinishedTask: !input.stateBlockers?.length,
    retrospectiveReady: hasRetrospectiveArtifact(input)
  });
  const issueCloseReady = closeIssueNumbers(input).length > 0;
  const decisionRequired = buildDecisionRequired(input, missing, issueCloseReady);
  const status = missing.length === 0 && policiesPassed(policyResults) && !input.issueSettlementBlockers?.length ? "ready" : "blocked";
  const appliedPolicies = buildAppliedPolicySummary(input);
  const scopeDecision = buildScopeDecisionSummary(input, status);
  const report = createReportDocument({
    title: "Harness CLI session close",
    summary: "Summarize session closure evidence and closed/close/keep/handoff issue settlement decisions.",
    checks: [
      {
        name: "completed tasks",
        status: input.completedTasks.length > 0 ? "pass" : "blocked",
        detail: input.completedTasks.length > 0 ? input.completedTasks.join("; ") : "missing"
      },
      {
        name: "session name update",
        status: input.sessionName ? "pass" : "blocked",
        detail: sessionNameDetail(input)
      },
      {
        name: "session number",
        status: input.sessionNumber ? "info" : "info",
        detail: input.sessionNumber ? `#${input.sessionNumber}` : ""
      },
      {
        name: "issue update",
        status: hasIssueUpdateEvidence(input) ? "pass" : "blocked",
        detail: issueUpdateDetail(input)
      },
      {
        name: "remaining backlog issue PR",
        status: input.remainingWork ? "pass" : "blocked",
        detail: input.remainingWork ?? "missing"
      },
      {
        name: "auto status lookup",
        status: input.autoStatus?.lookupStatus === "available" ? "pass" : "info",
        detail: input.autoStatus ? input.autoStatus.detail : "not requested"
      },
      {
        name: "retrospective",
        status: input.retrospective ? "pass" : "blocked",
        detail: input.retrospective ?? "missing"
      },
      {
        name: "retrospective artifact",
        status: hasRetrospectiveArtifact(input) ? "pass" : "blocked",
        detail: retrospectiveArtifactDetail(input)
      },
      {
        name: "unresolved work docs",
        status: input.unresolvedDocs.length > 0 ? "info" : "pass",
        detail: input.unresolvedDocs.length > 0 ? input.unresolvedDocs.join("; ") : "none"
      },
      {
        name: "hcp task state",
        status: input.stateBlockers && input.stateBlockers.length > 0 ? "blocked" : "pass",
        detail: input.stateBlockers && input.stateBlockers.length > 0 ? input.stateBlockers.join("; ") : "no unfinished hcp tasks"
      },
      {
        name: "next session handoff",
        status: input.handoff ? "pass" : "blocked",
        detail: input.handoff ?? "missing"
      },
      {
        name: "related issue settlement",
        status: input.issueSettlementBlockers?.length ? "blocked" : "pass",
        detail: input.issueSettlementBlockers?.length
          ? input.issueSettlementBlockers.join("; ")
          : formatRelatedIssueSummary(input.relatedIssues ?? [])
      },
      {
        name: "issue close readiness",
        status: issueCloseReady ? "pass" : "info",
        detail: issueCloseReady ? closeIssueNumbers(input).map((issue) => `#${issue}`).join(", ") : "no related issue classified as close"
      },
      {
        name: "write actions",
        status: "blocked",
        detail: blockedActions.map((action) => `${action} blocked`).join("; ")
      },
      {
        name: "decision required",
        status: decisionRequired.length > 0 ? "blocked" : "pass",
        detail: decisionRequired.length > 0 ? decisionRequired.join("; ") : "none"
      }
    ]
  });

  return {
    command: "session close",
    status,
    markdown: `${report.markdown}${buildPolicyScopeSummarySection(appliedPolicies, scopeDecision)}${buildNextSessionHandoffSection(input)}${buildPostCloseVerificationSection(input)}${buildIssueManagementSection(input, issueCloseReady)}`,
    json: {
      input,
      missing,
      decisionRequired,
      issueCloseReady,
      appliedPolicies,
      scopeDecision,
      policyResults
    },
    blockedActions
  };
}

export function enrichSessionCloseInputWithAutoStatus(
  input: SessionCloseInput,
  cwd: string,
  runner: CommandRunner = defaultCommandRunner
): SessionCloseInput {
  const autoStatus = readSessionCloseAutoStatus(cwd, runner);
  return {
    ...input,
    remainingWork: input.remainingWork ?? autoStatus.remainingWork,
    autoStatus
  };
}

export function enrichSessionCloseInputWithHcpState(
  input: SessionCloseInput,
  cwd: string,
  options: { refreshRetrospectiveSummary?: boolean } = {}
): SessionCloseInput {
  try {
    const session = input.sessionId
      ? readSessionById(cwd, input.sessionId)
      : resolveActiveSession(cwd, undefined, input.agentId);
    const promotedTasks = session.tasks.filter((task) => task.status === "promoted");
    const blockers = session.tasks
      .filter((task) => task.status === "active" || task.status === "closed")
      .map((task) => `${task.taskId} ${task.status}`);
    const workItemBlockers = listHcpUnfinishedWorkItems(session)
      .map((item) => `${item.workItemId} ${item.displayId} ${item.status}`);
    const workItemDecisions = listHcpUnfinishedWorkItems(session).map((item) => ({
      workItemId: item.workItemId,
      displayId: item.displayId,
      status: item.status,
      title: item.title,
      backlogCandidateId: item.backlogCandidateId
    }));
    const relatedIssues = mergeRelatedIssues(
      collectSessionRelatedIssues(session),
      [...(session.sessionCloseCheckpoint?.relatedIssues ?? []), ...(input.relatedIssues ?? [])]
    );
    const explicitlyClosing = new Set(input.verifiedIssueNumbers);
    for (const issue of relatedIssues) {
      if (explicitlyClosing.has(issue.number)) issue.decision = "close";
    }
    return {
      ...input,
      sessionId: session.sessionId,
      agentId: input.agentId ?? session.agentId,
      sessionNumber: input.sessionNumber ?? (session.sessionNumber === "manual" ? undefined : session.sessionNumber),
      sessionName: input.sessionName ?? session.sessionName,
      completedTasks: input.completedTasks.length > 0
        ? input.completedTasks
        : promotedTasks.map((task) => `${task.taskId} ${task.taskName}`),
      handoff: input.handoff ?? buildHcpSessionHandoff(session),
      hcpRetrospectiveSummary: options.refreshRetrospectiveSummary
        ? buildHcpSessionRetrospectiveSummary(session)
        : input.hcpRetrospectiveSummary ?? buildHcpSessionRetrospectiveSummary(session),
      verifiedIssueNumbers: uniqueNumbers(input.verifiedIssueNumbers),
      relatedIssues,
      retrospectiveDocument: input.retrospectiveDocument ?? session.sessionCloseCheckpoint?.retrospectiveDocument,
      recoveryCheckpoint: input.recoveryCheckpoint ?? session.sessionCloseCheckpoint,
      stateBlockers: [...blockers, ...workItemBlockers].length > 0 ? [...blockers, ...workItemBlockers] : input.stateBlockers,
      workItemDecisions: workItemDecisions.length > 0 ? workItemDecisions : input.workItemDecisions
    };
  } catch {
    return input;
  }
}

export function collectSessionRelatedIssues(session: HcpSessionState): SessionCloseRelatedIssue[] {
  const issues: SessionCloseRelatedIssue[] = [];
  if (session.linkedIssue?.number) {
    issues.push({ number: session.linkedIssue.number, sources: ["session.linkedIssue"], title: session.linkedIssue.title, url: session.linkedIssue.url });
  }
  for (const task of session.tasks) {
    if (task.issueNumber) issues.push({ number: task.issueNumber, sources: [`task:${task.taskId}`] });
  }
  return mergeRelatedIssues([], issues);
}

export function enrichSessionCloseInputWithIssueSettlement(
  input: SessionCloseInput,
  cwd: string,
  runner: CommandRunner = defaultCommandRunner
): SessionCloseInput {
  const relatedIssues = (input.relatedIssues ?? []).map((issue) => {
    let enriched = { ...issue, sources: [...issue.sources] };
    try {
      const metadata = JSON.parse(runner.run("gh", ["issue", "view", String(issue.number), "--json", "number,state,title,url"], cwd)) as {
        state?: string; title?: string; url?: string;
      };
      enriched = {
        ...enriched,
        state: metadata.state === "CLOSED" ? "CLOSED" : metadata.state === "OPEN" ? "OPEN" : "UNKNOWN",
        title: metadata.title ?? enriched.title,
        url: metadata.url ?? enriched.url
      };
    } catch {
      enriched.state = "UNKNOWN";
    }
    if (enriched.state === "CLOSED") enriched.decision = "closed";
    return enriched;
  });
  const blockers = relatedIssues.flatMap((issue) => {
    if (issue.state === "UNKNOWN") return [`#${issue.number} remote state unavailable`];
    if (issue.state === "OPEN" && !issue.decision) return [`#${issue.number} OPEN without close|keep|handoff decision`];
    if (issue.state === "OPEN" && (issue.decision === "keep" || issue.decision === "handoff") && (!issue.reason?.trim() || !issue.followUp?.trim())) {
      return [`#${issue.number} ${issue.decision} requires reason and follow-up location`];
    }
    return [];
  });
  return {
    ...input,
    relatedIssues,
    verifiedIssueNumbers: relatedIssues.filter((issue) => issue.state === "OPEN" && issue.decision === "close").map((issue) => issue.number),
    issueSettlementBlockers: blockers
  };
}

export function beginSessionCloseState(input: SessionCloseInput, cwd: string): {
  status: "updated" | "skipped" | "blocked";
  sessionId?: string;
  detail: string;
  executionInput: SessionCloseInput;
} {
  try {
    const session = resolveActiveSession(cwd, input.sessionId, input.agentId);
    if (input.issueSettlementBlockers?.length) {
      return {
        status: "blocked",
        sessionId: session.sessionId,
        detail: `session close related issue settlement blocked: ${input.issueSettlementBlockers.join("; ")}`,
        executionInput: input
      };
    }
    const unfinishedTasks = session.tasks.filter((task) => task.status === "active" || task.status === "closed");
    const unfinishedWorkItems = listHcpUnfinishedWorkItems(session);
    if (unfinishedTasks.length > 0 || unfinishedWorkItems.length > 0) {
      const detail = [
        ...unfinishedTasks.map((task) => `${task.taskId} ${task.status}`),
        ...unfinishedWorkItems.map((item) => `${item.workItemId} ${item.displayId} ${item.status}`)
      ].join("; ");
      const decisions = unfinishedWorkItems.length > 0
        ? `; decision required: ${unfinishedWorkItems.map((item) => `${item.displayId}=task|backlog|cancel`).join(", ")}; natural-language feedback does not change HCP state`
        : "";
      return { status: "blocked", sessionId: session.sessionId, detail: `session close requires all tasks and work items resolved: ${detail}${decisions}`, executionInput: input };
    }
    transitionHcpSessionStatus(cwd, session.sessionId, "closing");
    return {
      status: "updated",
      sessionId: session.sessionId,
      detail: `session ${session.sessionId} moved to closing`,
      executionInput: enrichSessionCloseInputWithHcpState(
        { ...input, sessionId: session.sessionId },
        cwd,
        { refreshRetrospectiveSummary: true }
      )
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "HCP session close state update unavailable";
    return {
      status: detail.startsWith("No active HCP session found") ? "skipped" : "blocked",
      detail,
      executionInput: input
    };
  }
}

export function completeSessionCloseState(
  cwd: string,
  sessionId: string | undefined,
  executionStatus: "executed" | "blocked" | "skipped",
  recovery?: SessionCloseRecoveryState
): void {
  if (!sessionId) return;
  if (executionStatus === "executed") {
    transitionHcpSessionStatus(cwd, sessionId, "complete");
    return;
  }
  if (executionStatus === "blocked") {
    transitionHcpSessionStatus(cwd, sessionId, recovery?.sessionStatus ?? "blocked");
    return;
  }
  transitionHcpSessionStatus(cwd, sessionId, "failed");
}

export function runSessionCloseExecution(
  input: SessionCloseInput,
  cwd: string,
  runner: CommandRunner = defaultCommandRunner,
  stateStore: SessionCloseStateStore = defaultSessionCloseStateStore
): {
  sessionState: ReturnType<typeof beginSessionCloseState>;
  execution?: SessionCloseExecutionResult;
} {
  const sessionState = beginSessionCloseState(input, cwd);
  if (sessionState.status === "blocked") return { sessionState };

  let execution = executeSessionClose(sessionState.executionInput, cwd, runner);
  if (sessionState.sessionId && execution.status === "blocked" && execution.recovery?.failedAction === "close_issue") {
    try {
      stateStore.recordCheckpoint(cwd, sessionState.sessionId, {
        resumeFrom: "close_issue",
        retrospectiveDocument: execution.recovery.retrospectiveDocument,
        pullRequestNumber: execution.recovery.pullRequestNumber,
        promotedCommit: execution.recovery.promotedCommit,
        targetBranches: execution.recovery.targetBranches ?? [],
        completedIssueSettlements: execution.recovery.completedIssueSettlements ?? [],
        relatedIssues: execution.recovery.relatedIssues ?? [],
        retryable: execution.recovery.retryable ?? false
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "checkpoint persistence failed";
      const recovery = {
        ...execution.recovery,
        retryable: false,
        sessionStatus: "active" as const,
        failure: `${execution.recovery.failure ?? "Issue settlement failed"}; checkpoint persistence failed: ${detail}`,
        recoveryAction: "HCP session restored to active; preserve any existing checkpoint and repair checkpoint storage before retrying #세션정리"
      };
      execution = buildExecutionResult("blocked", [
        ...execution.steps,
        { action: "check_gate", status: "blocked", detail: `checkpoint persistence failed: ${detail}` }
      ], recovery);
    }
  }
  if (sessionState.sessionId && execution.status === "executed") stateStore.clearCheckpoint(cwd, sessionState.sessionId);
  stateStore.completeState(cwd, sessionState.sessionId, execution.status, execution.recovery);
  return { sessionState, execution };
}

export function executeSessionClose(input: SessionCloseInput, cwd: string, runner: CommandRunner = defaultCommandRunner): SessionCloseExecutionResult {
  if (!input.execution?.enabled) {
    return buildExecutionResult("skipped", []);
  }
  input.execution = withExecutionDefaults(input.execution);

  const steps: SessionCloseExecutionResult["steps"] = [];
  const recovery: SessionCloseRecoveryState = {
    createdCommit: false,
    pushedBranch: false,
    retrospectiveDocument: input.retrospectiveDocument,
    targetBranches: input.execution.targetBranches
  };
  const startupGate = checkSessionCloseExecutionStartupGate(input.execution, cwd, runner);
  recovery.branch = startupGate.branch;
  if (startupGate.status === "blocked") {
    steps.push({ action: "check_gate", status: "blocked", detail: startupGate.detail });
    return buildExecutionResult("blocked", steps);
  }
  const resumeGate = input.recoveryCheckpoint ? validateSessionCloseCheckpoint(input.recoveryCheckpoint, cwd, runner) : undefined;
  if (resumeGate?.status === "blocked") {
    steps.push({ action: "check_gate", status: "blocked", detail: resumeGate.detail });
    recovery.failedAction = "check_gate";
    recovery.failure = resumeGate.detail;
    recovery.failureCategory = resumeGate.failureCategory ?? "command";
    recovery.retryable = resumeGate.retryable ?? false;
    recovery.recoveryAction = resumeGate.recoveryAction ?? "preserve the checkpoint, restore the verified retrospective/PR/promotion evidence, and retry #세션정리";
    recovery.sessionStatus = "active";
    return buildExecutionResult("blocked", steps, recovery);
  }

  try {
    for (const action of executionActions) {
    if (input.recoveryCheckpoint?.resumeFrom === "close_issue" && action !== "close_issue") {
      steps.push({ action, status: "skipped", detail: "recovery checkpoint verified; completed session-close action not repeated" });
      continue;
    }
    if (action === "write_retrospective" && input.retrospectiveDeferredReason) {
      steps.push({ action, status: "skipped", detail: `retrospective deferred: ${input.retrospectiveDeferredReason}` });
      continue;
    }
    if (action === "write_retrospective" && input.retrospectiveDocument) {
      steps.push({ action, status: "skipped", detail: `retrospective artifact provided: ${input.retrospectiveDocument}` });
      continue;
    }
    if (action === "write_retrospective" && !input.retrospective) {
      steps.push({ action, status: "blocked", detail: "retrospective summary is required before generating a retrospective artifact" });
      return buildExecutionResult("blocked", steps);
    }

    const gate = checkGate({
      mode: "session-close-execute",
      tag: "session_close",
      requestedAction: action
    });
    if (!gate.allowed) {
      steps.push({ action, status: "blocked", detail: gate.reason });
      return buildExecutionResult("blocked", steps);
    }

    if (action === "write_retrospective") {
      const beforeDiffCheck = runDiffCheck(cwd, runner);
      if (beforeDiffCheck.status === "blocked") {
        steps.push({ action, status: "blocked", detail: `pre-retrospective git diff --check failed: ${beforeDiffCheck.detail}` });
        return buildExecutionResult("blocked", steps);
      }
      const artifact = writeNumberedSessionRetrospectiveArtifact(input, cwd, runner);
      input.retrospectiveDocument = artifact.relativePath;
      recovery.retrospectiveDocument = artifact.relativePath;
      input.execution.paths.push(...artifact.changedPaths);
      const afterDiffCheck = runDiffCheck(cwd, runner);
      if (afterDiffCheck.status === "blocked") {
        steps.push({ action, status: "blocked", detail: `post-retrospective git diff --check failed: ${afterDiffCheck.detail}` });
        return buildExecutionResult("blocked", steps);
      }
      steps.push({ action, status: "executed", detail: `created ${artifact.relativePath}` });
      continue;
    }

    if (action === "update_issue") {
      const retrospectiveMarkerCheck = input.retrospectiveDocument
        ? verifyRetrospectiveCloseMarkers(input, cwd, runner)
        : undefined;
      if (retrospectiveMarkerCheck?.status === "blocked") {
        recovery.failedAction = "check_gate";
        recovery.failure = retrospectiveMarkerCheck.detail;
        recovery.retryable = true;
        recovery.recoveryAction = "restore the HCP session to active, correct the retrospective close markers, and retry #세션정리";
        recovery.completedActions = steps
          .filter((step) => step.status === "executed" || step.status === "skipped")
          .map((step) => step.action);
        recovery.sessionStatus = "active";
        steps.push({ action: "check_gate", status: "blocked", detail: retrospectiveMarkerCheck.detail });
        return buildExecutionResult("blocked", steps, recovery);
      }
      if (retrospectiveMarkerCheck) {
        steps.push({ action: "check_gate", status: "executed", detail: retrospectiveMarkerCheck.detail });
      }
    }

    if (action === "update_issue") {
      if (!hasIssueUpdateIntent(input)) {
        steps.push({ action, status: "skipped", detail: "no issue update requested" });
        continue;
      }
      const missing = missingIssueUpdateOptions(input.execution);
      if (missing.length > 0) {
        steps.push({ action, status: "blocked", detail: `missing execution options: ${missing.join("; ")}` });
        return buildExecutionResult("blocked", steps);
      }
      const issueNumber = input.execution.relatedIssueNumber as number;
      const editedFields: string[] = [];
      if (input.execution.issueTitle) {
        runner.run("gh", ["issue", "edit", String(issueNumber), "--title", input.execution.issueTitle], cwd);
        editedFields.push("title");
      }
      if (input.execution.issueBody) {
        runner.run("gh", ["issue", "edit", String(issueNumber), "--body", input.execution.issueBody], cwd);
        editedFields.push("body");
      }
      const comment = input.execution.issueComment ?? input.issueUpdate;
      if (comment) {
        runner.run("gh", ["issue", "comment", String(issueNumber), "--body", comment], cwd);
        editedFields.push("comment");
      }
      steps.push({ action, status: "executed", detail: `updated issue #${issueNumber}: ${editedFields.join(", ")}` });
      continue;
    }

    if (["commit_changes", "push_branch", "create_pr", "merge_pr", "promote_branch"].includes(action)
      && !hasPrExecutionIntent(input.execution)) {
      steps.push({ action, status: "skipped", detail: "no session close PR execution requested" });
      continue;
    }

    if (action === "merge_pr" && !input.execution.mergePr) {
      steps.push({ action, status: "skipped", detail: "merge disabled by --no-merge" });
      continue;
    }

    if (action === "promote_branch" && (!input.execution.promote || !input.execution.mergePr)) {
      steps.push({ action, status: "skipped", detail: input.execution.promote ? "promotion requires merged PR" : "promotion disabled by --no-promote" });
      continue;
    }

    if (action === "commit_changes") {
      const missing = missingPrExecutionOptions(input.execution);
      if (missing.length > 0) {
        steps.push({ action, status: "blocked", detail: `missing execution options: ${missing.join("; ")}` });
        return buildExecutionResult("blocked", steps);
      }
    }

    if (action === "commit_changes") {
      runner.run("git", ["add", "--", ...unique(input.execution.paths)], cwd);
      runner.run("git", ["commit", "-m", input.execution.commitMessage ?? ""], cwd);
      recovery.createdCommit = true;
      steps.push({ action, status: "executed", detail: `committed ${unique(input.execution.paths).length} path(s)` });
      continue;
    }

    if (action === "push_branch") {
      const branch = runner.run("git", ["branch", "--show-current"], cwd);
      recovery.branch = branch;
      runner.run("git", ["push", "origin", branch], cwd);
      recovery.pushedBranch = true;
      steps.push({ action, status: "executed", detail: `pushed ${branch}` });
      continue;
    }

    if (action === "create_pr") {
      const branch = runner.run("git", ["branch", "--show-current"], cwd);
      const body = input.execution.prBody ?? buildDefaultPrBody(input.execution);
      const existingPr = readExistingPr(cwd, runner);
      if (existingPr?.state === "OPEN") {
        if (!input.execution.reuseOpenPr) {
          steps.push({ action, status: "blocked", detail: buildOpenPrReuseBlockedDetail(existingPr.url) });
          return buildExecutionResult("blocked", steps);
        }
        runner.run("gh", ["pr", "edit", "--title", input.execution.prTitle ?? "", "--body", body], cwd);
        recovery.pullRequestNumber = parsePullRequestNumber(existingPr.url);
        steps.push({ action, status: "executed", detail: `${existingPr.url ?? "open PR"} updated by explicit reuse approval` });
        continue;
      }
      const prUrl = runner.run("gh", [
        "pr",
        "create",
        "--base",
        input.execution.baseBranch,
        "--head",
        branch,
        "--title",
        input.execution.prTitle ?? "",
        "--body",
        body
      ], cwd);
      recovery.pullRequestNumber = parsePullRequestNumber(prUrl);
      steps.push({ action, status: "executed", detail: prUrl || "PR created" });
      continue;
    }

    if (action === "merge_pr") {
      markPrReady(cwd, runner);
      runner.run("gh", ["pr", "merge", "--merge", "--delete-branch=false"], cwd);
      steps.push({ action, status: "executed", detail: "PR merged" });
      continue;
    }

    if (action === "promote_branch") {
      runner.run("git", ["fetch", "origin", input.execution.baseBranch], cwd);
      const targetCommit = runner.run("git", ["rev-parse", `origin/${input.execution.baseBranch}`], cwd);
      recovery.promotedCommit = targetCommit;
      for (const branch of input.execution.targetBranches) {
        runner.run("git", ["push", "origin", `${targetCommit}:refs/heads/${branch}`], cwd);
        runner.run("git", ["fetch", "origin", branch], cwd);
        const promotedCommit = runner.run("git", ["rev-parse", `origin/${branch}`], cwd);
        if (promotedCommit !== targetCommit) {
          steps.push({ action, status: "blocked", detail: `${branch} verification failed: ${promotedCommit} != ${targetCommit}` });
          return buildExecutionResult("blocked", steps);
        }
        steps.push({ action, status: "executed", detail: `${branch} -> ${targetCommit}` });
      }
      continue;
    }

    const report = buildSessionCloseReport(input);
    if (report.status !== "ready") {
      steps.push({ action, status: "blocked", detail: "session close report is not ready" });
      return buildExecutionResult("blocked", steps);
    }
    const settlementIssues = issueSettlementTargets(input);
    if (settlementIssues.length === 0) {
      steps.push({ action, status: "skipped", detail: "no open related issue requires settlement action" });
      continue;
    }

    for (const issue of settlementIssues) {
      if (issue.decision === "close") {
        runner.run("gh", ["issue", "close", String(issue.number), "--comment", buildIssueSettlementComment(issue)], cwd);
        steps.push({ action, status: "executed", detail: `settled issue #${issue.number}: close` });
      } else {
        const marker = issueSettlementMarker(input, issue);
        if (hasIssueSettlementComment(issue.number, marker, cwd, runner)) {
          steps.push({ action, status: "skipped", detail: `settlement already recorded for issue #${issue.number}: ${issue.decision}` });
        } else {
          runner.run("gh", ["issue", "comment", String(issue.number), "--body", buildIssueSettlementComment(issue, marker)], cwd);
          steps.push({ action, status: "executed", detail: `settled issue #${issue.number}: ${issue.decision}` });
        }
      }
    }
  }
  } catch (error) {
    const failedAction = inferFailedAction(steps);
    const failureEvidence = isGitHubAction(failedAction)
      ? classifyGitHubCommandFailure(error)
      : {
          category: "command" as const,
          retryable: false,
          failure: error instanceof Error ? error.message : "session close command failed",
          recovery: "inspect the local command failure before retrying; do not classify it as a GitHub API failure"
        };
    recovery.failedAction = failedAction;
    recovery.failure = failureEvidence.failure;
    recovery.failureCategory = failureEvidence.category;
    recovery.retryable = failureEvidence.retryable;
    recovery.recoveryAction = failureEvidence.recovery;
    recovery.completedActions = steps.filter((step) => step.status === "executed" || step.status === "skipped").map((step) => step.action);
    recovery.completedIssueSettlements = steps
      .map((step) => step.detail.match(/^settled issue #(\d+):/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    recovery.relatedIssues = input.relatedIssues;
    if (failedAction === "close_issue") {
      recovery.sessionStatus = "active";
      recovery.recoveryAction = `${failureEvidence.recovery}; HCP session restored to active and completed prerequisites/Issue decisions preserved; immediate retry=${failureEvidence.retryable ? "allowed" : "requires operator remediation"}`;
    }
    steps.push({ action: failedAction, status: "blocked", detail: recovery.failure });
    return buildExecutionResult("blocked", steps, recovery);
  }

  return buildExecutionResult("executed", steps);
}

function missingFields(input: SessionCloseInput): string[] {
  const missing: string[] = [];
  if (input.completedTasks.length === 0) {
    missing.push("completed tasks");
  }
  if (!input.sessionName) {
    missing.push("session name");
  }
  if (!hasIssueUpdateEvidence(input)) {
    missing.push("issue update");
  }
  if (!input.remainingWork) {
    missing.push("remaining backlog issue PR");
  }
  if (!input.retrospective) {
    missing.push("retrospective");
  }
  if (!hasRetrospectiveArtifact(input)) {
    missing.push("retrospective artifact");
  }
  if (!input.handoff) {
    missing.push("next session handoff");
  }
  if (input.stateBlockers && input.stateBlockers.length > 0) {
    missing.push("unfinished hcp tasks");
  }
  return missing;
}

function buildAppliedPolicySummary(input: SessionCloseInput): PolicySummary[] {
  return [
    {
      id: "REF-008",
      decision: "applied",
      summary: "session close requires closure evidence, retrospective handling, handoff, and complete related Issue settlement decisions"
    },
    {
      id: "REF-011",
      decision: "applied",
      summary: "session/task scope is summarized by decision outcome instead of repeating the full reference text"
    },
    {
      id: "POL-006",
      decision: input.execution?.enabled ? "applied" : "not_applicable",
      summary: input.execution?.enabled
        ? "machine checks gate write execution and promotion"
        : "machine checks are deferred until execution mode"
    }
  ];
}

function buildScopeDecisionSummary(input: SessionCloseInput, status: SessionCloseReport["status"]): ScopeDecisionSummary {
  const blockers = missingFields(input);
  return {
    scope: "session_close",
    decision: status === "ready" ? "allowed" : "blocked",
    summary: status === "ready"
      ? "closure evidence is complete; execution still requires per-action safety gates"
      : `closure evidence incomplete: ${blockers.join("; ")}`
  };
}

function checkSessionCloseExecutionStartupGate(
  execution: SessionCloseExecutionOptions,
  cwd: string,
  runner: CommandRunner
): { status: "ready" | "blocked"; branch?: string; detail: string } {
  const branch = readCurrentBranch(cwd, runner);
  if (!branch) {
    return { status: "ready", detail: "current branch unavailable; later git steps will validate repository state" };
  }
  if (isProtectedBranch(branch)) {
    return {
      status: "blocked",
      branch,
      detail: `session close --execute cannot run directly on protected branch ${branch}; create a session close work branch first`
    };
  }
  if (hasPrExecutionIntent(execution) && branch === execution.baseBranch) {
    return {
      status: "blocked",
      branch,
      detail: `PR head and base are identical (${branch}); checkout a work branch before write actions`
    };
  }
  return { status: "ready", branch, detail: `current branch ${branch}` };
}

function readCurrentBranch(cwd: string, runner: CommandRunner): string | undefined {
  try {
    return runner.run("git", ["branch", "--show-current"], cwd).trim() || undefined;
  } catch {
    return undefined;
  }
}

function isProtectedBranch(branch: string): boolean {
  return ["dev", "stg", "main"].includes(branch);
}

function runDiffCheck(cwd: string, runner: CommandRunner): { status: "pass" | "blocked"; detail: string } {
  try {
    runner.run("git", ["diff", "--check"], cwd);
    return { status: "pass", detail: "git diff --check passed" };
  } catch (error) {
    return {
      status: "blocked",
      detail: error instanceof Error ? error.message : "git diff --check failed"
    };
  }
}

function verifyRetrospectiveCloseMarkers(
  input: SessionCloseInput,
  cwd: string,
  runner: CommandRunner
): { status: "pass" | "blocked"; detail: string } {
  if (!input.retrospectiveDocument?.trim()) {
    return { status: "blocked", detail: "retrospective close marker verification failed: retrospective document missing" };
  }
  try {
    const repoRoot = resolve(runner.run("git", ["rev-parse", "--show-toplevel"], cwd));
    const documentPath = resolve(repoRoot, input.retrospectiveDocument);
    const relativePath = relative(repoRoot, documentPath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return { status: "blocked", detail: "retrospective close marker verification failed: document is outside repository" };
    }
    const markdown = readFileSync(documentPath, "utf8");
    const missingMarkers = requiredRetrospectiveCloseMarkers.filter((marker) => !markdown.includes(marker));
    if (missingMarkers.length > 0) {
      return {
        status: "blocked",
        detail: `retrospective close marker verification failed: missing ${missingMarkers.join("; ")}`
      };
    }
    return { status: "pass", detail: `retrospective close markers verified: ${relativePath}` };
  } catch (error) {
    return {
      status: "blocked",
      detail: `retrospective close marker verification failed: ${error instanceof Error ? error.message : "document read failed"}`
    };
  }
}

function inferFailedAction(steps: SessionCloseExecutionResult["steps"]): HarnessAction {
  const last = steps.at(-1);
  if (!last) {
    return "check_gate";
  }
  const nextIndex = executionActions.indexOf(last.action) + 1;
  return executionActions[nextIndex] ?? last.action;
}

function readSessionCloseAutoStatus(cwd: string, runner: CommandRunner): SessionCloseAutoStatus {
  try {
    const repoRoot = readRepoRoot(cwd, runner);
    const openIssueCount = readGhItemCount(cwd, runner, ["issue", "list", "--state", "open", "--json", "number,title"]);
    const openPrCount = readGhItemCount(cwd, runner, ["pr", "list", "--state", "open", "--json", "number,title"]);
    const openBacklogCount = readOpenBacklogCount(repoRoot);
    const branchAlignment = readRemoteBranchAlignment(cwd, runner);
    const remainingWork = `open backlog: ${openBacklogCount}; open issues: ${openIssueCount}; open PRs: ${openPrCount}`;
    return {
      lookupStatus: "available",
      remainingWork,
      branchAlignment,
      detail: `${remainingWork}; ${branchAlignment}`
    };
  } catch (error) {
    return {
      lookupStatus: "unavailable",
      detail: error instanceof Error ? error.message : "session close auto status lookup unavailable"
    };
  }
}

function readRepoRoot(cwd: string, runner: CommandRunner): string {
  try {
    return runner.run("git", ["rev-parse", "--show-toplevel"], cwd);
  } catch {
    return cwd;
  }
}

function readGhItemCount(cwd: string, runner: CommandRunner, args: string[]): number {
  const output = runner.run("gh", args, cwd);
  const items = JSON.parse(output || "[]") as unknown[];
  return Array.isArray(items) ? items.length : 0;
}

function readOpenBacklogCount(repoRoot: string): number {
  const readmePath = join(repoRoot, "docs", "15.\uB85C\uADF8", "backlog", "README.md");
  if (!existsSync(readmePath)) {
    return 0;
  }
  const markdown = readFileSync(readmePath, "utf8");
  return countUnresolvedBacklogEntries(markdown);
}

function readRemoteBranchAlignment(cwd: string, runner: CommandRunner): string {
  const dev = runner.run("git", ["rev-parse", "origin/dev"], cwd);
  const stg = runner.run("git", ["rev-parse", "origin/stg"], cwd);
  const main = runner.run("git", ["rev-parse", "origin/main"], cwd);
  return dev === stg && stg === main
    ? `dev/stg/main aligned: ${main}`
    : `dev/stg/main not aligned: dev=${dev}; stg=${stg}; main=${main}`;
}

function isSessionNumberToken(value: string): boolean {
  return /^\d{1,3}$/.test(value);
}

function normalizeSessionNumber(value: string): string {
  return value.padStart(3, "0");
}

function sessionNameDetail(input: SessionCloseInput): string {
  if (!input.sessionName) {
    return input.sessionNumber ? `missing; session number #${input.sessionNumber} provided for session name update` : "missing";
  }
  return sessionNameWithNumber(input);
}

function sessionNameWithNumber(input: SessionCloseInput): string {
  if (!input.sessionName) {
    return input.sessionNumber ?? "";
  }
  if (!input.sessionNumber) {
    return input.sessionName;
  }
  const prefix = `${input.sessionNumber}_`;
  return input.sessionName.startsWith(prefix) ? input.sessionName : `${prefix}${input.sessionName}`;
}

function hasRetrospectiveArtifact(input: SessionCloseInput): boolean {
  return Boolean(input.retrospectiveDocument?.trim() || input.retrospectiveDeferredReason?.trim() || (input.execution?.enabled && input.retrospective?.trim()));
}

function retrospectiveArtifactDetail(input: SessionCloseInput): string {
  if (input.retrospectiveDocument?.trim()) {
    return input.retrospectiveDocument;
  }
  if (input.retrospectiveDeferredReason?.trim()) {
    return `deferred: ${input.retrospectiveDeferredReason}`;
  }
  if (input.execution?.enabled && input.retrospective?.trim()) {
    return "will be generated during execution";
  }
  return "missing; provide --retrospective-doc or --retrospective-deferred";
}

function hasIssueUpdateEvidence(input: SessionCloseInput): boolean {
  return Boolean(input.issueUpdate?.trim()
    || input.execution?.issueTitle?.trim()
    || input.execution?.issueBody?.trim()
    || input.execution?.issueComment?.trim());
}

function hasIssueUpdateIntent(input: SessionCloseInput): boolean {
  return Boolean(input.execution?.issueTitle?.trim()
    || input.execution?.issueBody?.trim()
    || input.execution?.issueComment?.trim()
    || (input.execution?.relatedIssueNumber && input.issueUpdate?.trim()));
}

function issueUpdateDetail(input: SessionCloseInput): string {
  if (input.issueUpdate?.trim()) {
    return input.issueUpdate;
  }
  const fields = [
    input.execution?.issueTitle ? "title" : "",
    input.execution?.issueBody ? "body" : "",
    input.execution?.issueComment ? "comment" : ""
  ].filter(Boolean);
  return fields.length > 0 ? `will update issue ${fields.join(", ")}` : "missing";
}

function buildDecisionRequired(input: SessionCloseInput, missing: string[], issueCloseReady: boolean): string[] {
  const decisions = [...missing];
  for (const item of input.workItemDecisions ?? []) {
    decisions.push(
      `${item.displayId} ${item.workItemId} [${item.status}] ${item.title}: choose `
      + `#태스크시작 후 decision=task, #백로그추가 후 decision=backlog, or decision=cancel; natural-language feedback does not change HCP state`
    );
  }
  if (hasIssueUpdateIntent(input) && !input.execution?.relatedIssueNumber) {
    decisions.push("related issue for issue update");
  }
  return unique(decisions);
}

function writeNumberedSessionRetrospectiveArtifact(
  input: SessionCloseInput,
  cwd: string,
  runner: CommandRunner
): { relativePath: string; changedPaths: string[] } {
  const repoRoot = runner.run("git", ["rev-parse", "--show-toplevel"], cwd);
  const retrospectiveDir = join(repoRoot, "docs", retrospectiveDirectoryName);
  const readmePath = join(retrospectiveDir, "README.md");
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
  const nextId = nextRetrospectiveId(readme);
  const today = new Date().toISOString().slice(0, 10);
  const title = sessionNameWithNumber(input) || defaultSessionRetrospectiveTitle;
  const fileName = `${nextId}_${today}_${slugifyFilePart(title)}_${retrospectiveLabel}.md`;
  const relativePath = `docs/${retrospectiveDirectoryName}/${fileName}`;
  const absolutePath = join(retrospectiveDir, fileName);

  mkdirSync(dirname(absolutePath), { recursive: true });
  if (!existsSync(absolutePath)) {
    writeFileSync(absolutePath, buildNumberedSessionRetrospectiveMarkdown(nextId, today, input), "utf8");
  }
  writeFileSync(readmePath, upsertRetrospectiveIndex(readme, nextId, today, title, fileName), "utf8");

  return { relativePath, changedPaths: unique([relativePath, `docs/${retrospectiveDirectoryName}/README.md`]) };
}

function writeSessionRetrospectiveArtifact(
  input: SessionCloseInput,
  cwd: string,
  runner: CommandRunner
): { relativePath: string; changedPaths: string[] } {
  const repoRoot = runner.run("git", ["rev-parse", "--show-toplevel"], cwd);
  const retrospectiveDir = join(repoRoot, "docs", "12.회고");
  const readmePath = join(retrospectiveDir, "README.md");
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
  const nextId = nextRetrospectiveId(readme);
  const today = new Date().toISOString().slice(0, 10);
  const title = input.sessionName ?? "세션정리 회고";
  const fileName = `${nextId}_${today}_${slugifyFilePart(title)}_회고.md`;
  const relativePath = `docs/12.회고/${fileName}`;
  const absolutePath = join(retrospectiveDir, fileName);

  mkdirSync(dirname(absolutePath), { recursive: true });
  if (!existsSync(absolutePath)) {
    writeFileSync(absolutePath, buildSessionRetrospectiveMarkdown(nextId, today, input), "utf8");
  }
  writeFileSync(readmePath, upsertRetrospectiveIndex(readme, nextId, today, title, fileName), "utf8");

  return { relativePath, changedPaths: unique([relativePath, "docs/12.회고/README.md"]) };
}

function writeRetrospectiveArtifact(
  input: SessionCloseInput,
  cwd: string,
  runner: CommandRunner
): { relativePath: string; changedPaths: string[] } {
  const repoRoot = runner.run("git", ["rev-parse", "--show-toplevel"], cwd);
  const readmePath = join(repoRoot, "docs", "12.회고", "README.md");
  const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
  const nextId = nextRetrospectiveId(readme);
  const today = new Date().toISOString().slice(0, 10);
  const title = input.sessionName ?? "세션정리 회고";
  const fileName = `${nextId}_${today}_${slugifyFilePart(title)}_회고.md`;
  const relativePath = `docs/12.회고/${fileName}`;
  const absolutePath = join(repoRoot, relativePath);

  mkdirSync(dirname(absolutePath), { recursive: true });
  if (!existsSync(absolutePath)) {
    writeFileSync(absolutePath, buildRetrospectiveMarkdown(nextId, today, input), "utf8");
  }
  writeFileSync(readmePath, upsertRetrospectiveIndex(readme, nextId, today, title, fileName), "utf8");

  return { relativePath, changedPaths: unique([relativePath, "docs/12.회고/README.md"]) };
}

function hasPrExecutionIntent(execution: SessionCloseExecutionOptions): boolean {
  return execution.paths.length > 0
    || Boolean(execution.commitMessage)
    || Boolean(execution.prTitle)
    || Boolean(execution.prBody)
    || execution.reuseOpenPr;
}

function missingPrExecutionOptions(execution: SessionCloseExecutionOptions): string[] {
  const missing: string[] = [];
  if (execution.paths.length === 0) {
    missing.push("path");
  }
  if (!execution.commitMessage) {
    missing.push("message");
  }
  if (!execution.prTitle) {
    missing.push("pr-title");
  }
  if (execution.prTitle && !isCompliantPrTitle(execution.prTitle)) {
    missing.push("compliant pr-title");
  }
  if (!execution.relatedIssueNumber) {
    missing.push("related-issue");
  }
  return missing;
}

function missingIssueUpdateOptions(execution: SessionCloseExecutionOptions): string[] {
  const missing: string[] = [];
  if (!execution.relatedIssueNumber) {
    missing.push("related-issue");
  }
  if (execution.issueTitle && !isCompliantIssueTitle(execution.issueTitle)) {
    missing.push("compliant issue-title");
  }
  return missing;
}

function isCompliantPrTitle(title: string): boolean {
  return /^\[\d{3}\]_\(\d{3}\)_.+/.test(title);
}

function isCompliantIssueTitle(title: string): boolean {
  return /^\[\d{3}\]_\[[^\]]+\]_.+/.test(title);
}

function readExistingPr(cwd: string, runner: CommandRunner): { url?: string; state?: string } | undefined {
  try {
    const output = runner.run("gh", ["pr", "view", "--json", "url,state"], cwd);
    const pr = JSON.parse(output || "{}") as { url?: string; state?: string };
    return pr;
  } catch {
    return undefined;
  }
}

function buildOpenPrReuseBlockedDetail(prUrl?: string): string {
  return [
    `open PR detected: ${prUrl ?? "unknown"}`,
    "explicit #세션정리.PR재사용 approval is required before updating an open session close PR",
    "retry order:",
    "#세션정리.PR재사용{",
    `대상: ${prUrl ?? "PR #확인필요"}`,
    "사유: 현재 브랜치에 열린 세션정리 PR이 있어 기존 PR을 갱신해 계속 진행",
    "}"
  ].join("\n");
}

function buildNextSessionHandoffSection(input: SessionCloseInput): string {
  const lines = [
    "",
    "## Next Session Handoff",
    "",
    `- session: ${sessionNameWithNumber(input) || "확인 필요"}`,
    `- next start: ${input.handoff ?? "확인 필요"}`,
    `- remaining work: ${input.remainingWork ?? "확인 필요"}`,
    `- HCP state: ${input.sessionId ? `.hcp/sessions/*/${input.sessionId}.json` : "not linked"}`,
    "",
    "### Copy-ready Next Work Prompt",
    "",
    "```text",
    buildCopyReadyHandoff(input),
    "```"
  ];
  return `${lines.join("\n")}\n`;
}

function buildPostCloseVerificationSection(input: SessionCloseInput): string {
  const autoStatus = input.autoStatus;
  const lines = [
    "",
    "## Post-close Verification",
    "",
    `- open issue/PR/backlog: ${autoStatus?.remainingWork ?? input.remainingWork ?? "확인 필요"}`,
    `- branch alignment: ${autoStatus?.branchAlignment ?? "확인 필요"}`,
    `- retrospective artifact: ${retrospectiveArtifactDetail(input)}`,
    `- HCP task state: ${input.stateBlockers?.length ? input.stateBlockers.join("; ") : "no unfinished hcp tasks"}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildIssueManagementSection(input: SessionCloseInput, issueCloseReady: boolean): string {
  const target = input.execution?.relatedIssueNumber
    ? `#${input.execution.relatedIssueNumber}`
    : input.verifiedIssueNumbers.length > 0
      ? input.verifiedIssueNumbers.map((issue) => `#${issue}`).join(", ")
      : "none";
  const decision = issueCloseReady ? "close related Issue classified as close" : "no close target; preserve closed/keep/handoff decisions";
  const comment = input.execution?.issueComment ?? input.issueUpdate ?? input.handoff ?? "확인 필요";
  const lines = [
    "",
    "## Issue Management Comment",
    "",
    `- target: ${target}`,
    `- decision: ${decision}`,
    `- content: ${comment}`,
    "",
    "### Related Issue Settlement",
    "",
    ...(input.relatedIssues?.length
      ? input.relatedIssues.map((issue) => `- #${issue.number} [${issue.state ?? "UNKNOWN"}] => ${issue.decision ?? "undecided"}; source=${issue.sources.join(",")}; reason=${issue.reason ?? "-"}; follow-up=${issue.followUp ?? "-"}`)
      : ["- none"])
  ];
  return `${lines.join("\n")}\n`;
}

function buildPolicyScopeSummarySection(
  appliedPolicies: PolicySummary[],
  scopeDecision: ScopeDecisionSummary
): string {
  const lines = [
    "",
    "## Policy And Scope Summary",
    "",
    "### appliedPolicies",
    "",
    ...appliedPolicies.map((policy) => `- ${policy.id} [${policy.decision}]: ${policy.summary}`),
    "",
    "### scopeDecision",
    "",
    `- scope: ${scopeDecision.scope}`,
    `- decision: ${scopeDecision.decision}`,
    `- summary: ${scopeDecision.summary}`
  ];
  return `${lines.join("\n")}\n`;
}

function markPrReady(cwd: string, runner: CommandRunner): void {
  try {
    runner.run("gh", ["pr", "ready"], cwd);
  } catch {
    // Already-ready PRs or hosts without draft support can continue to merge.
  }
}

function buildDefaultPrBody(execution: SessionCloseExecutionOptions): string {
  return [
    "## Summary",
    "",
    execution.commitMessage ?? "Session close execution",
    "",
    "## Changed Paths",
    "",
    ...unique(execution.paths).map((path) => `- ${path}`),
    "",
    `Related #${execution.relatedIssueNumber}`
  ].join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function nextRetrospectiveId(readme: string): string {
  const ids = [...readme.matchAll(/RET-(\d{3})/g)].map((match) => Number(match[1]));
  const next = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  return `RET-${String(next).padStart(3, "0")}`;
}

function buildNumberedSessionRetrospectiveMarkdown(id: string, date: string, input: SessionCloseInput): string {
  return `${[
    `# ${id} ${date} ${sessionNameWithNumber(input) || defaultSessionRetrospectiveTitle}`,
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| 문서 ID | ${id} |`,
    `| 문서 유형 | ${retrospectiveLabel} |`,
    `| 세션번호 | ${input.sessionNumber ?? ""} |`,
    `| 세션명 | ${sessionNameWithNumber(input)} |`,
    "| 상태 | Draft |",
    `| 최종 수정일 | ${date} |`,
    "",
    "## 1. 완료 태스크",
    "",
    ...(input.completedTasks.length > 0 ? input.completedTasks.map((task) => `- ${task}`) : ["- 확인 필요"]),
    "",
    "## 2. Issue 현행화",
    "",
    input.issueUpdate ?? issueUpdateDetail(input),
    "",
    ...buildRelatedIssueSettlementLines(input),
    "",
    "## 3. 남은 작업",
    "",
    input.remainingWork ?? "확인 필요",
    "",
    "## 4. 회고",
    "",
    input.retrospective ?? "확인 필요",
    "",
    "## 5. 미정리 문서",
    "",
    ...(input.unresolvedDocs.length > 0 ? input.unresolvedDocs.map((doc) => `- ${doc}`) : ["- 없음"]),
    "",
    "## 6. 다음 세션 인계",
    "",
    input.handoff ?? "확인 필요",
    "",
    "```text",
    buildCopyReadyHandoff(input),
    "```",
    "",
    ...(input.hcpRetrospectiveSummary ? [input.hcpRetrospectiveSummary] : []),
    ""
  ].join("\n")}\n`;
}

function buildSessionRetrospectiveMarkdown(id: string, date: string, input: SessionCloseInput): string {
  return `${[
    `# ${id} ${date} ${input.sessionName ?? "세션정리 회고"}`,
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| 문서 ID | ${id} |`,
    "| 문서 유형 | 회고 |",
    `| 세션번호 | ${input.sessionNumber ?? ""} |`,
    `| 세션명 | ${input.sessionName ?? ""} |`,
    "| 상태 | Draft |",
    `| 최종 수정일 | ${date} |`,
    "",
    "## 1. 완료 태스크",
    "",
    ...(input.completedTasks.length > 0 ? input.completedTasks.map((task) => `- ${task}`) : ["- 확인 필요"]),
    "",
    "## 2. Issue 현행화",
    "",
    input.issueUpdate ?? issueUpdateDetail(input),
    "",
    ...buildRelatedIssueSettlementLines(input),
    "",
    "## 3. 남은 작업",
    "",
    input.remainingWork ?? "확인 필요",
    "",
    "## 4. 회고",
    "",
    input.retrospective ?? "확인 필요",
    "",
    "## 5. 미정리 문서",
    "",
    ...(input.unresolvedDocs.length > 0 ? input.unresolvedDocs.map((doc) => `- ${doc}`) : ["- 없음"]),
    "",
    "## 6. 다음 세션 인계",
    "",
    buildCopyReadyHandoff(input),
    "",
    "```text",
    buildCopyReadyHandoff(input),
    "```",
    ""
  ].join("\n")}\n`;
}

function buildRetrospectiveMarkdown(id: string, date: string, input: SessionCloseInput): string {
  return `${[
    `# ${id} ${date} ${input.sessionName ?? "세션정리 회고"}`,
    "",
    "| 항목 | 값 |",
    "|---|---|",
    `| 문서 ID | ${id} |`,
    "| 문서 유형 | 회고 |",
    `| 세션번호 | ${input.sessionNumber ?? ""} |`,
    `| 세션명 | ${input.sessionName ?? ""} |`,
    "| 상태 | Draft |",
    `| 최종 수정일 | ${date} |`,
    "",
    "## 1. 완료 태스크",
    "",
    ...(input.completedTasks.length > 0 ? input.completedTasks.map((task) => `- ${task}`) : ["- 확인 필요"]),
    "",
    "## 2. Issue 현행화",
    "",
    input.issueUpdate ?? "확인 필요",
    "",
    ...buildRelatedIssueSettlementLines(input),
    "",
    "## 3. 남은 작업",
    "",
    input.remainingWork ?? "확인 필요",
    "",
    "## 4. 회고",
    "",
    input.retrospective ?? "확인 필요",
    "",
    "## 5. 미정리 문서",
    "",
    ...(input.unresolvedDocs.length > 0 ? input.unresolvedDocs.map((doc) => `- ${doc}`) : ["- 없음"]),
    "",
    "## 6. 다음 세션 인계",
    "",
    input.handoff ?? "확인 필요",
    "",
    "```text",
    buildCopyReadyHandoff(input),
    "```",
    ""
  ].join("\n")}\n`;
}

function upsertRetrospectiveIndex(readme: string, id: string, date: string, title: string, fileName: string): string {
  if (readme.includes(`| ${id} |`)) {
    return readme;
  }

  const row = `| ${id} | [${date} ${title}](./${fileName}) | Draft |`;
  const lines = readme ? readme.split(/\r?\n/) : ["# 12.회고", "", "| 문서 ID | 문서명 | 상태 |", "|---|---|---|"];
  const lastRetIndex = lines.reduce((last, line, index) => line.startsWith("| RET-") ? index : last, -1);
  if (lastRetIndex >= 0) {
    lines.splice(lastRetIndex + 1, 0, row);
  } else {
    lines.push(row);
  }
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

function slugifyFilePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "세션정리";
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseIssueDecision(value: string, decision: "keep" | "handoff"): SessionCloseRelatedIssue | undefined {
  const [rawNumber, reason, followUp] = value.split("|").map((part) => part.trim());
  const number = Number(rawNumber?.replace(/^#/, ""));
  return Number.isFinite(number) ? { number, sources: ["command"], decision, reason, followUp } : undefined;
}

function mergeRelatedIssues(base: SessionCloseRelatedIssue[], additions: SessionCloseRelatedIssue[]): SessionCloseRelatedIssue[] {
  const merged = new Map<number, SessionCloseRelatedIssue>();
  for (const issue of [...base, ...additions]) {
    const previous = merged.get(issue.number);
    const next: SessionCloseRelatedIssue = {
      ...previous,
      ...issue,
      sources: [...new Set([...(previous?.sources ?? []), ...issue.sources])],
      decision: issue.decision ?? previous?.decision,
      reason: issue.reason ?? previous?.reason,
      followUp: issue.followUp ?? previous?.followUp
    };
    for (const key of ["decision", "reason", "followUp", "title", "url", "state"] as const) {
      if (next[key] === undefined) delete next[key];
    }
    merged.set(issue.number, next);
  }
  return [...merged.values()].sort((left, right) => left.number - right.number);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function closeIssueNumbers(input: SessionCloseInput): number[] {
  if (input.relatedIssues?.length) {
    return uniqueNumbers(input.relatedIssues.filter((issue) => issue.state !== "CLOSED" && issue.decision === "close").map((issue) => issue.number));
  }
  return uniqueNumbers(input.verifiedIssueNumbers);
}

function issueSettlementTargets(input: SessionCloseInput): SessionCloseRelatedIssue[] {
  if (input.relatedIssues?.length) {
    return input.relatedIssues.filter((issue) => issue.state === "OPEN" && ["close", "keep", "handoff"].includes(issue.decision ?? ""));
  }
  return uniqueNumbers(input.verifiedIssueNumbers).map((number) => ({ number, sources: ["verifiedIssueNumbers"], state: "OPEN", decision: "close" }));
}

function issueSettlementMarker(input: SessionCloseInput, issue: SessionCloseRelatedIssue): string {
  const sessionKey = input.sessionId ?? input.sessionNumber ?? input.sessionName ?? "unlinked";
  const digest = createHash("sha256")
    .update([issue.decision, issue.reason ?? "", issue.followUp ?? ""].join("\n"))
    .digest("hex")
    .slice(0, 12);
  return `<!-- hcp-session-close-settlement:${sessionKey}:${issue.number}:${issue.decision}:${digest} -->`;
}

function hasIssueSettlementComment(issueNumber: number, marker: string, cwd: string, runner: CommandRunner): boolean {
  const output = runner.run("gh", ["api", "--paginate", "--slurp", `repos/{owner}/{repo}/issues/${issueNumber}/comments?per_page=100`], cwd).trim();
  if (!output) return false;
  const payload = JSON.parse(output) as Array<Array<{ body?: string }> | { body?: string }>;
  const comments = payload.flatMap((page) => Array.isArray(page) ? page : [page]);
  return comments.some((comment) => comment.body?.includes(marker));
}

function validateSessionCloseCheckpoint(
  checkpoint: HcpSessionCloseCheckpoint,
  cwd: string,
  runner: CommandRunner
): {
  status: "pass" | "blocked";
  detail: string;
  failureCategory?: GitHubFailureCategory;
  retryable?: boolean;
  recoveryAction?: string;
} {
  const failures: string[] = [];
  if (checkpoint.retrospectiveDocument && !existsSync(resolve(cwd, checkpoint.retrospectiveDocument))) {
    failures.push(`retrospective missing: ${checkpoint.retrospectiveDocument}`);
  }
  if (checkpoint.pullRequestNumber) {
    try {
      const metadata = JSON.parse(runner.run("gh", ["pr", "view", String(checkpoint.pullRequestNumber), "--json", "state"], cwd)) as { state?: string };
      if (metadata.state !== "MERGED") failures.push(`PR #${checkpoint.pullRequestNumber} is not MERGED`);
    } catch (error) {
      const failure = classifyGitHubCommandFailure(error);
      return {
        status: "blocked",
        detail: `session close recovery checkpoint verification command failed: ${failure.failure}`,
        failureCategory: failure.category,
        retryable: failure.retryable,
        recoveryAction: `${failure.recovery}; preserve the existing checkpoint and retry checkpoint verification`
      };
    }
  }
  if (checkpoint.promotedCommit) {
    for (const branch of checkpoint.targetBranches) {
      try {
        const current = runner.run("git", ["rev-parse", `origin/${branch}`], cwd);
        if (current !== checkpoint.promotedCommit) failures.push(`${branch}=${current || "missing"} expected ${checkpoint.promotedCommit}`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "git verification failed";
        return {
          status: "blocked",
          detail: `session close recovery checkpoint verification command failed: ${detail}`,
          failureCategory: "command",
          retryable: false,
          recoveryAction: "preserve the existing checkpoint, restore the remote Git refs, and retry checkpoint verification"
        };
      }
    }
  }
  return failures.length
    ? { status: "blocked", detail: `session close recovery checkpoint verification failed: ${failures.join("; ")}` }
    : { status: "pass", detail: "session close recovery checkpoint verified; resume from close_issue" };
}

function parsePullRequestNumber(value?: string): number | undefined {
  const raw = value?.match(/\/pull\/(\d+)/)?.[1];
  const number = raw ? Number(raw) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function buildIssueSettlementComment(issue: SessionCloseRelatedIssue, marker?: string): string {
  return [
    ...(marker ? [marker] : []),
    `HCP session close settlement: ${issue.decision}`,
    `Issue: #${issue.number}`,
    `Reason: ${issue.reason ?? (issue.decision === "close" ? "verified session work completed" : "-")}`,
    `Follow-up: ${issue.followUp ?? (issue.decision === "close" ? "none" : "-")}`
  ].join("\n");
}

function buildCopyReadyHandoff(input: SessionCloseInput): string {
  const followUps = (input.relatedIssues ?? [])
    .filter((issue) => issue.state === "OPEN" && (issue.decision === "keep" || issue.decision === "handoff"))
    .map((issue) => `- Issue #${issue.number} ${issue.decision}: ${issue.reason}; follow-up: ${issue.followUp}`);
  return [input.handoff ?? "확인 필요", ...(followUps.length ? ["", "Related Issue follow-ups:", ...followUps] : [])].join("\n");
}

function formatRelatedIssueSummary(issues: SessionCloseRelatedIssue[]): string {
  return issues.length
    ? issues.map((issue) => `#${issue.number}=${issue.state ?? "UNKNOWN"}/${issue.decision ?? "undecided"}`).join("; ")
    : "no related issues";
}

function buildRelatedIssueSettlementLines(input: SessionCloseInput): string[] {
  return [
    "### 관련 Issue 결산",
    "",
    ...(input.relatedIssues?.length
      ? input.relatedIssues.map((issue) => `- #${issue.number}: ${issue.state ?? "UNKNOWN"} / ${issue.decision ?? "undecided"}; 사유=${issue.reason ?? "-"}; 후속=${issue.followUp ?? "-"}`)
      : ["- 없음"])
  ];
}

function withExecutionDefaults(execution: SessionCloseExecutionOptions): SessionCloseExecutionOptions {
  return {
    ...execution,
    paths: execution.paths ?? [],
    baseBranch: execution.baseBranch ?? "dev",
    mergePr: execution.mergePr ?? true,
    promote: execution.promote ?? true,
    reuseOpenPr: execution.reuseOpenPr ?? false,
    targetBranches: execution.targetBranches ?? ["stg", "main"]
  };
}

const defaultCommandRunner: CommandRunner = {
  run(command: string, args: string[], cwd: string): string {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  }
};

const defaultSessionCloseStateStore: SessionCloseStateStore = {
  recordCheckpoint: recordHcpSessionCloseCheckpoint,
  clearCheckpoint: clearHcpSessionCloseCheckpoint,
  completeState: completeSessionCloseState
};

function buildExecutionResult(
  status: SessionCloseExecutionResult["status"],
  steps: SessionCloseExecutionResult["steps"],
  recovery?: SessionCloseRecoveryState
): SessionCloseExecutionResult {
  const markdown = [
    "# Harness CLI session close execution",
    "",
    `status: ${status}`,
    "",
    "## Steps",
    "",
    ...(steps.length === 0 ? ["- [skipped] execution: not requested"] : steps.map((step) => `- [${step.status}] ${step.action}: ${step.detail}`))
  ].join("\n");

  return {
    status,
    markdown: `${markdown}${buildRecoveryReportSection(recovery)}\n`,
    steps,
    recovery: recovery?.failure ? recovery : undefined
  };
}

function isGitHubAction(action: HarnessAction): boolean {
  return action === "update_issue" || action === "create_pr" || action === "merge_pr" || action === "close_issue";
}

function buildRecoveryReportSection(recovery?: SessionCloseRecoveryState): string {
  if (!recovery?.failure) {
    return "";
  }
  const remaining = recovery.pushedBranch
    ? "inspect or update the pushed branch, then create or reuse the PR explicitly"
    : recovery.createdCommit
      ? "inspect the local commit and push or amend it before retrying"
      : "fix the failing condition and rerun before commit/push";
  return [
    "",
    "",
    "## Recovery Report",
    "",
    `- failed action: ${recovery.failedAction ?? "unknown"}`,
    `- branch: ${recovery.branch ?? "unknown"}`,
    `- created commit: ${recovery.createdCommit ? "yes" : "no"}`,
    `- pushed branch: ${recovery.pushedBranch ? "yes" : "no"}`,
    `- completed actions: ${(recovery.completedActions ?? []).join(", ") || "none"}`,
    `- completed issue settlements: ${(recovery.completedIssueSettlements ?? []).map((number) => `#${number}`).join(", ") || "none"}`,
    `- failure category: ${recovery.failureCategory ?? "unknown"}`,
    `- retryable: ${recovery.retryable ? "yes" : "no"}`,
    `- remaining action: ${remaining}`,
    `- recovery action: ${recovery.recoveryAction ?? "inspect the failure before retrying"}`,
    `- failure: ${recovery.failure}`
  ].join("\n");
}
