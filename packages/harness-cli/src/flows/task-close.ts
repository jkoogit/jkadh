import { execFileSync } from "node:child_process";

import { checkGate, type HarnessAction } from "../gates/check-gate.ts";
import { createReportDocument } from "../reports/create-report.ts";

export interface TaskCloseInput {
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  completionSummary?: string;
  verificationResult?: string;
  remainingWork?: string;
  outOfScope?: string;
  gitSummary?: TaskCloseGitSummary;
  execution?: TaskCloseExecutionOptions;
}

export interface TaskCloseExecutionOptions {
  enabled: boolean;
  paths: string[];
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
  relatedIssueNumber?: number;
  baseBranch: string;
  mergePr: boolean;
}

export interface TaskCloseGitSummary {
  statusShort: string;
  diffStat: string;
}

export interface TaskCloseReport {
  command: "task close";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    input: TaskCloseInput;
    missing: string[];
    prReady: boolean;
    suggestedOrder?: string;
  };
  blockedActions: string[];
}

const blockedActions = ["commit_changes", "push_branch", "create_pr", "merge_pr_to_dev"];
const executionActions: HarnessAction[] = ["commit_changes", "push_branch", "create_pr", "merge_pr_to_dev"];

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): string;
}

export type GateChecker = typeof checkGate;

export interface TaskCloseExecutionResult {
  status: "executed" | "blocked" | "skipped";
  markdown: string;
  steps: {
    action: HarnessAction;
    status: "executed" | "blocked" | "skipped";
    detail: string;
  }[];
}

export function parseTaskCloseArgs(args: string[]): TaskCloseInput {
  const input: TaskCloseInput = {};
  const execution: TaskCloseExecutionOptions = {
    enabled: false,
    paths: [],
    baseBranch: "dev",
    mergePr: true
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

    const value = args[index + 1];
    if (!value) {
      continue;
    }
    if (key === "--completion") {
      input.completionSummary = value;
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
    if (key === "--task-id") {
      input.taskId = value;
      index += 1;
    }
    if (key === "--verification") {
      input.verificationResult = value;
      index += 1;
    }
    if (key === "--remaining") {
      input.remainingWork = value;
      index += 1;
    }
    if (key === "--out-of-scope") {
      input.outOfScope = value;
      index += 1;
    }
    if (key === "--path") {
      execution.paths.push(value);
      index += 1;
    }
    if (key === "--paths") {
      execution.paths.push(...value.split(",").map((path) => path.trim()).filter(Boolean));
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
    if (key === "--base") {
      execution.baseBranch = value;
      index += 1;
    }
  }

  if (execution.enabled || execution.paths.length > 0 || execution.commitMessage || execution.prTitle || execution.prBody || execution.relatedIssueNumber) {
    input.execution = execution;
  }

  return input;
}

export function parseTaskCloseBlock(block: string): TaskCloseInput {
  const input: TaskCloseInput = {};
  const body = block.match(/#태스크정리\s*\{([\s\S]*)\}/)?.[1] ?? block;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "}") {
      continue;
    }

    const match = line.match(/^([^:=]+)\s*[:=]\s*(.*)$/);
    if (!match) {
      continue;
    }

    applyTaskCloseField(input, match[1].trim(), match[2].trim());
  }

  return input;
}

export function buildTaskCloseReport(input: TaskCloseInput): TaskCloseReport {
  const missing = missingFields(input);
  const prReady = missing.length === 0 && normalizeNone(input.remainingWork);
  const suggestedOrder = missing.length > 0 ? buildSuggestedTaskCloseOrder(input) : undefined;
  const status = missing.length === 0 ? "ready" : "blocked";
  const gitSummary = input.gitSummary ?? { statusShort: "", diffStat: "" };

  const report = createReportDocument({
    title: "Harness CLI task close",
    summary: "Summarize implementation evidence before task-level PR creation and merge.",
    checks: [
      {
        name: "change summary",
        status: gitSummary.statusShort.trim() ? "info" : "blocked",
        detail: summarizeGitStatus(gitSummary)
      },
      {
        name: "completion summary",
        status: input.completionSummary ? "pass" : "blocked",
        detail: input.completionSummary ?? "missing"
      },
      {
        name: "verification result",
        status: input.verificationResult ? "pass" : "blocked",
        detail: input.verificationResult ?? "missing"
      },
      {
        name: "out of scope",
        status: input.outOfScope ? "info" : "blocked",
        detail: input.outOfScope ?? "missing"
      },
      {
        name: "remaining work",
        status: input.remainingWork ? "info" : "blocked",
        detail: input.remainingWork ?? "missing"
      },
      {
        name: "PR readiness",
        status: prReady ? "pass" : "blocked",
        detail: prReady ? "ready for commit, push, PR creation, and dev PR merge" : "requires completion evidence and no remaining work"
      },
      {
        name: "execution plan",
        status: prReady ? "pass" : "blocked",
        detail: buildExecutionPlanDetail(input.execution)
      },
      {
        name: "write actions",
        status: "blocked",
        detail: blockedActions.map((action) => `${action} blocked`).join("; ")
      }
    ]
  });
  const markdown = suggestedOrder
    ? `${report.markdown}\n## Suggested Order\n\n동의하면 아래 정리 주문서를 기준으로 진행한다.\n\n\`\`\`text\n${suggestedOrder}\n\`\`\`\n`
    : report.markdown;

  return {
    command: "task close",
    status,
    markdown,
    json: {
      input,
      missing,
      prReady,
      suggestedOrder
    },
    blockedActions
  };
}

export function readTaskCloseGitSummary(cwd: string): TaskCloseGitSummary {
  const gitRoot = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return {
    statusShort: runGit(gitRoot, ["status", "--short"]),
    diffStat: runGit(gitRoot, ["diff", "--stat"])
  };
}

export function executeTaskClose(
  input: TaskCloseInput,
  cwd: string,
  runner: CommandRunner = defaultCommandRunner,
  gateChecker: GateChecker = checkGate
): TaskCloseExecutionResult {
  if (!input.execution?.enabled) {
    return buildExecutionResult("skipped", []);
  }

  const report = buildTaskCloseReport(input);
  if (!report.json.prReady) {
    return buildExecutionResult("blocked", [{
      action: "commit_changes",
      status: "blocked",
      detail: "task close report is not PR-ready"
    }]);
  }

  const missing = missingExecutionOptions(input.execution);
  if (missing.length > 0) {
    return buildExecutionResult("blocked", [{
      action: "commit_changes",
      status: "blocked",
      detail: `missing execution options: ${missing.join("; ")}`
    }]);
  }

  const steps: TaskCloseExecutionResult["steps"] = [];
  for (const action of executionActions) {
    if (action === "merge_pr_to_dev" && !input.execution.mergePr) {
      steps.push({ action, status: "skipped", detail: "dev merge disabled by explicit --no-merge" });
      continue;
    }

    const gate = gateChecker({
      mode: "task-close-execute",
      tag: "task_close",
      requestedAction: action
    });
    if (!gate.allowed) {
      steps.push({ action, status: "blocked", detail: gate.reason });
      return buildExecutionResult("blocked", steps);
    }

    steps.push(runExecutionStep(action, input.execution, cwd, runner));
  }

  return buildExecutionResult("executed", steps);
}

function missingFields(input: TaskCloseInput): string[] {
  const missing: string[] = [];
  if (!input.completionSummary) {
    missing.push("completion summary");
  }
  if (!input.verificationResult) {
    missing.push("verification result");
  }
  if (!input.outOfScope) {
    missing.push("out of scope");
  }
  if (!input.remainingWork) {
    missing.push("remaining work");
  }
  return missing;
}

function buildSuggestedTaskCloseOrder(input: TaskCloseInput): string {
  return [
    "#태스크정리{",
    `완료내용: ${input.completionSummary ?? "확인필요"}`,
    `검증결과: ${input.verificationResult ?? "확인필요"}`,
    `제외범위: ${input.outOfScope ?? "확인필요"}`,
    `남은작업: ${input.remainingWork ?? "없음"}`,
    "}"
  ].join("\n");
}

function applyTaskCloseField(input: TaskCloseInput, key: string, value: string): void {
  const field = normalizeTaskCloseField(key);
  if (!field || !value) {
    return;
  }

  input[field] = value;
}

function normalizeTaskCloseField(key: string): keyof Omit<TaskCloseInput, "gitSummary"> | undefined {
  const normalized = key.replace(/\s+/g, "").toLowerCase();
  const aliases: Record<string, keyof Omit<TaskCloseInput, "gitSummary">> = {
    c: "completionSummary",
    completion: "completionSummary",
    완료내용: "completionSummary",
    v: "verificationResult",
    verification: "verificationResult",
    검증결과: "verificationResult",
    o: "outOfScope",
    outofscope: "outOfScope",
    제외범위: "outOfScope",
    r: "remainingWork",
    remaining: "remainingWork",
    남은작업: "remainingWork"
  };

  return aliases[normalized];
}

function normalizeNone(value?: string): boolean {
  if (!value) {
    return false;
  }
  return ["none", "no", "없음", "없다"].includes(value.trim().toLowerCase());
}

function summarizeGitStatus(gitSummary: TaskCloseGitSummary): string {
  const status = gitSummary.statusShort.trim().replace(/\r?\n/g, "; ") || "clean";
  const stat = gitSummary.diffStat.trim().replace(/\r?\n/g, "; ") || "no tracked diff";
  return `${status}; ${stat}`;
}

function buildExecutionPlanDetail(execution?: TaskCloseExecutionOptions): string {
  const baseBranch = execution?.baseBranch ?? "dev";
  const mergeStep = execution?.mergePr === false
    ? "merge_pr_to_dev explicitly disabled by --no-merge"
    : `merge_pr_to_dev -> ${baseBranch}`;
  return [
    "commit_changes",
    "push_branch",
    `create_pr -> ${baseBranch}`,
    mergeStep
  ].join(" -> ");
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
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

function runExecutionStep(
  action: HarnessAction,
  execution: TaskCloseExecutionOptions,
  cwd: string,
  runner: CommandRunner
): TaskCloseExecutionResult["steps"][number] {
  if (action === "commit_changes") {
    runner.run("git", ["add", "--", ...execution.paths], cwd);
    runner.run("git", ["commit", "-m", execution.commitMessage ?? ""], cwd);
    return { action, status: "executed", detail: `committed ${execution.paths.length} path(s)` };
  }

  if (action === "push_branch") {
    const branch = runner.run("git", ["branch", "--show-current"], cwd);
    runner.run("git", ["push", "origin", branch], cwd);
    return { action, status: "executed", detail: `pushed ${branch}` };
  }

  if (action === "create_pr") {
    const branch = runner.run("git", ["branch", "--show-current"], cwd);
    const body = execution.prBody ?? buildDefaultPrBody(execution);
    const existingPrUrl = readExistingPrUrl(cwd, runner);
    if (existingPrUrl) {
      runner.run("gh", [
        "pr",
        "edit",
        "--title",
        execution.prTitle ?? "",
        "--body",
        body
      ], cwd);
      return { action, status: "executed", detail: `${existingPrUrl} updated` };
    }

    const prUrl = runner.run("gh", [
      "pr",
      "create",
      "--base",
      execution.baseBranch,
      "--head",
      branch,
      "--title",
      execution.prTitle ?? "",
      "--body",
      body
    ], cwd);
    return { action, status: "executed", detail: prUrl || "PR created" };
  }

  if (action === "merge_pr_to_dev") {
    markPrReady(cwd, runner);
    runner.run("gh", ["pr", "merge", "--merge", "--delete-branch=false"], cwd);
    return { action, status: "executed", detail: `PR merged to ${execution.baseBranch}` };
  }

  return { action, status: "skipped", detail: "unsupported action" };
}

function readExistingPrUrl(cwd: string, runner: CommandRunner): string | undefined {
  try {
    const url = runner.run("gh", ["pr", "view", "--json", "url", "--jq", ".url"], cwd);
    return url.trim() || undefined;
  } catch {
    return undefined;
  }
}

function markPrReady(cwd: string, runner: CommandRunner): void {
  try {
    runner.run("gh", ["pr", "ready"], cwd);
  } catch {
    // Already-ready PRs or hosts without draft support can continue to merge.
  }
}

function missingExecutionOptions(execution: TaskCloseExecutionOptions): string[] {
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

function isCompliantPrTitle(title: string): boolean {
  return /^\[\d{3}\]_\(\d{3}\)_.+/.test(title);
}

function buildDefaultPrBody(execution: TaskCloseExecutionOptions): string {
  const body = [
    "## Summary",
    "",
    execution.commitMessage ?? "Task close execution",
    "",
    "## Changed Paths",
    "",
    ...execution.paths.map((path) => `- ${path}`)
  ];

  if (execution.relatedIssueNumber) {
    body.push("", `Related #${execution.relatedIssueNumber}`);
  }

  return body.join("\n");
}

function buildExecutionResult(status: TaskCloseExecutionResult["status"], steps: TaskCloseExecutionResult["steps"]): TaskCloseExecutionResult {
  const markdown = [
    "# Harness CLI task close execution",
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
