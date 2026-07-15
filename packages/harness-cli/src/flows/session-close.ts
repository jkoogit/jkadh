import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { countUnresolvedBacklogEntries } from "../docs/backlog-index.ts";
import { checkGate, type HarnessAction } from "../gates/check-gate.ts";
import { createReportDocument } from "../reports/create-report.ts";
import { buildHcpSessionHandoff, buildHcpSessionRetrospectiveSummary, readSessionById, resolveActiveSession } from "../state/session-state.ts";

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
  retrospective?: string;
  retrospectiveDocument?: string;
  retrospectiveDeferredReason?: string;
  hcpRetrospectiveSummary?: string;
  handoff?: string;
  unresolvedDocs: string[];
  verifiedIssueNumbers: number[];
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
  };
  blockedActions: string[];
}

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): string;
}

export interface SessionCloseExecutionResult {
  status: "executed" | "blocked" | "skipped";
  markdown: string;
  steps: {
    action: HarnessAction;
    status: "executed" | "blocked" | "skipped";
    detail: string;
  }[];
}

const blockedActions = ["write_retrospective", "update_issue", "commit_changes", "push_branch", "create_pr", "merge_pr", "promote_branch", "close_issue"];
const executionActions: HarnessAction[] = ["write_retrospective", "update_issue", "commit_changes", "push_branch", "create_pr", "merge_pr", "promote_branch", "close_issue"];
const retrospectiveDirectoryName = "12.\uD68C\uACE0";
const retrospectiveLabel = "\uD68C\uACE0";
const defaultSessionRetrospectiveTitle = "\uC138\uC158\uC815\uB9AC \uD68C\uACE0";
const verifiedSessionCloseComment = "Closed by verified #\uC138\uC158\uC815\uB9AC.";

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
  const issueCloseReady = input.verifiedIssueNumbers.length > 0;
  const decisionRequired = buildDecisionRequired(input, missing, issueCloseReady);
  const status = missing.length === 0 ? "ready" : "blocked";
  const report = createReportDocument({
    title: "Harness CLI session close",
    summary: "Summarize session closure evidence and verified issue-close candidates.",
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
        name: "issue close readiness",
        status: issueCloseReady ? "pass" : "info",
        detail: issueCloseReady ? input.verifiedIssueNumbers.map((issue) => `#${issue}`).join(", ") : "no verified issue close candidate"
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
    markdown: `${report.markdown}${buildNextSessionHandoffSection(input)}${buildPostCloseVerificationSection(input)}${buildIssueManagementSection(input, issueCloseReady)}`,
    json: {
      input,
      missing,
      decisionRequired,
      issueCloseReady
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

export function enrichSessionCloseInputWithHcpState(input: SessionCloseInput, cwd: string): SessionCloseInput {
  try {
    const session = input.sessionId
      ? readSessionById(cwd, input.sessionId)
      : resolveActiveSession(cwd, undefined, input.agentId);
    const promotedTasks = session.tasks.filter((task) => task.status === "promoted");
    const blockers = session.tasks
      .filter((task) => task.status === "active" || task.status === "closed")
      .map((task) => `${task.taskId} ${task.status}`);
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
      hcpRetrospectiveSummary: input.hcpRetrospectiveSummary ?? buildHcpSessionRetrospectiveSummary(session),
      verifiedIssueNumbers: input.verifiedIssueNumbers.length > 0
        ? input.verifiedIssueNumbers
        : session.linkedIssue?.number ? [session.linkedIssue.number] : [],
      stateBlockers: blockers.length > 0 ? blockers : input.stateBlockers
    };
  } catch {
    return input;
  }
}

export function executeSessionClose(input: SessionCloseInput, cwd: string, runner: CommandRunner = defaultCommandRunner): SessionCloseExecutionResult {
  if (!input.execution?.enabled) {
    return buildExecutionResult("skipped", []);
  }
  input.execution = withExecutionDefaults(input.execution);

  const steps: SessionCloseExecutionResult["steps"] = [];
  for (const action of executionActions) {
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
      const artifact = writeNumberedSessionRetrospectiveArtifact(input, cwd, runner);
      input.retrospectiveDocument = artifact.relativePath;
      input.execution.paths.push(...artifact.changedPaths);
      steps.push({ action, status: "executed", detail: `created ${artifact.relativePath}` });
      continue;
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
      steps.push({ action, status: "executed", detail: `committed ${unique(input.execution.paths).length} path(s)` });
      continue;
    }

    if (action === "push_branch") {
      const branch = runner.run("git", ["branch", "--show-current"], cwd);
      runner.run("git", ["push", "origin", branch], cwd);
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
    if (!report.json.issueCloseReady) {
      steps.push({ action, status: "blocked", detail: "no verified issue close candidate" });
      return buildExecutionResult("blocked", steps);
    }

    for (const issueNumber of input.verifiedIssueNumbers) {
      runner.run("gh", ["issue", "close", String(issueNumber), "--comment", verifiedSessionCloseComment], cwd);
      steps.push({
        action,
        status: "executed",
        detail: `closed issue #${issueNumber}`
      });
    }
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
  if (!issueCloseReady) {
    decisions.push("verified issue close candidate");
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
    `- HCP state: ${input.sessionId ? `.hcp/sessions/*/${input.sessionId}.json` : "not linked"}`
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
  const decision = issueCloseReady ? "close verified issue candidate" : "keep issue open or no issue target";
  const comment = input.execution?.issueComment ?? input.issueUpdate ?? input.handoff ?? "확인 필요";
  const lines = [
    "",
    "## Issue Management Comment",
    "",
    `- target: ${target}`,
    `- decision: ${decision}`,
    `- content: ${comment}`
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

function buildExecutionResult(status: SessionCloseExecutionResult["status"], steps: SessionCloseExecutionResult["steps"]): SessionCloseExecutionResult {
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
    markdown: `${markdown}\n`,
    steps
  };
}
