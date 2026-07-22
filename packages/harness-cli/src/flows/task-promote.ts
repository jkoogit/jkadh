import { execFileSync } from "node:child_process";

import { checkGate, type HarnessAction } from "../gates/check-gate.ts";
import { evaluateStagePolicies, policiesPassed, type PolicyResult } from "../gates/stage-policy.ts";
import { createReportDocument } from "../reports/create-report.ts";
import type { HcpTaskCloseEvidence } from "../state/session-state.ts";

export interface TaskPromoteInput {
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  targetCommit?: string;
  targetBranches: string[];
  verificationResult?: string;
  execution?: TaskPromoteExecutionOptions;
  branchStatus?: TaskPromoteBranchStatus[];
  closeEvidence?: HcpTaskCloseEvidence;
  pullRequestLinked?: boolean;
  devContainsTarget?: boolean;
  enforceHcpPolicies?: boolean;
}

export interface TaskPromoteExecutionOptions {
  enabled: boolean;
}

export interface TaskPromoteBranchStatus {
  branch: string;
  currentCommit: string;
  targetCommit: string;
  fastForward: boolean;
}

export interface TaskPromoteReport {
  command: "task promote";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    input: TaskPromoteInput;
    missing: string[];
    promotionReady: boolean;
    policyResults: PolicyResult[];
  };
  blockedActions: string[];
}

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): string;
}

export interface TaskPromoteExecutionResult {
  status: "executed" | "blocked" | "skipped";
  markdown: string;
  steps: {
    action: HarnessAction;
    status: "executed" | "blocked" | "skipped";
    detail: string;
  }[];
}

export interface NextWorkReviewInput {
  issueNumber?: number;
  openPullRequestCount?: number;
  unfinishedTaskCount?: number;
  nextPrompt?: string;
}

const blockedActions = ["promote_branch"];
const executionActions: HarnessAction[] = ["promote_branch"];

export function parseTaskPromoteArgs(args: string[]): TaskPromoteInput {
  const input: TaskPromoteInput = {
    targetBranches: ["stg", "main"]
  };
  const execution: TaskPromoteExecutionOptions = {
    enabled: false
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

    const value = args[index + 1];
    if (!value) {
      continue;
    }
    if (key === "--target-commit") {
      input.targetCommit = value;
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
    if (key === "--target-branches") {
      input.targetBranches = value.split(",").map((branch) => branch.trim()).filter(Boolean);
      index += 1;
    }
    if (key === "--target-branch") {
      input.targetBranches.push(value);
      index += 1;
    }
    if (key === "--verification") {
      input.verificationResult = value;
      index += 1;
    }
  }

  if (execution.enabled) {
    input.execution = execution;
  }

  return input;
}

export function buildTaskPromoteReport(input: TaskPromoteInput): TaskPromoteReport {
  const missing = missingFields(input);
  const branchStatus = input.branchStatus ?? [];
  const policyResults = input.enforceHcpPolicies ? evaluateStagePolicies("task_promote", {
    closedTask: Boolean(input.taskId),
    closeEvidencePassed: input.closeEvidence?.outcome === "passed",
    pullRequestLinked: input.pullRequestLinked === true,
    devContainsTarget: input.devContainsTarget === true
  }) : [];
  const promotionReady = missing.length === 0
    && branchStatus.length === input.targetBranches.length
    && branchStatus.every((status) => status.fastForward)
    && policiesPassed(policyResults);
  const reportStatus = promotionReady ? "ready" : "blocked";

  const report = createReportDocument({
    title: "Harness CLI task promote",
    summary: "Check and promote merged task changes to target branches.",
    checks: [
      {
        name: "target commit",
        status: input.targetCommit ? "pass" : "blocked",
        detail: input.targetCommit ?? "missing"
      },
      {
        name: "target branches",
        status: input.targetBranches.length > 0 ? "pass" : "blocked",
        detail: input.targetBranches.length > 0 ? input.targetBranches.join(", ") : "missing"
      },
      {
        name: "verification result",
        status: input.verificationResult ? "pass" : "blocked",
        detail: input.verificationResult ?? "missing"
      },
      {
        name: "branch readiness",
        status: promotionReady ? "pass" : "blocked",
        detail: summarizeBranchStatus(input, branchStatus)
      },
      ...(input.enforceHcpPolicies ? [{
        name: "HCP policy evidence",
        status: policiesPassed(policyResults) ? "pass" as const : "blocked" as const,
        detail: policyResults.map((result) => `${result.policyId}=${result.status}`).join("; ")
      }] : []),
      {
        name: "write actions",
        status: "blocked",
        detail: blockedActions.map((action) => `${action} blocked`).join("; ")
      }
    ]
  });

  return {
    command: "task promote",
    status: reportStatus,
    markdown: report.markdown,
    json: {
      input,
      missing,
      promotionReady,
      policyResults
    },
    blockedActions
  };
}

export function readTaskPromoteBranchStatus(input: TaskPromoteInput, cwd: string): TaskPromoteBranchStatus[] {
  if (!input.targetCommit) {
    return [];
  }

  return input.targetBranches.map((branch) => {
    const currentCommit = runGit(cwd, ["rev-parse", `origin/${branch}`]);
    return {
      branch,
      currentCommit,
      targetCommit: input.targetCommit ?? "",
      fastForward: isAncestor(cwd, currentCommit, input.targetCommit ?? "")
    };
  });
}

export function executeTaskPromote(input: TaskPromoteInput, cwd: string, runner: CommandRunner = defaultCommandRunner): TaskPromoteExecutionResult {
  if (!input.execution?.enabled) {
    return buildExecutionResult("skipped", []);
  }

  const report = buildTaskPromoteReport(input);
  if (!report.json.promotionReady) {
    return buildExecutionResult("blocked", [{
      action: "promote_branch",
      status: "blocked",
      detail: "task promote report is not ready"
    }]);
  }

  const steps: TaskPromoteExecutionResult["steps"] = [];
  for (const action of executionActions) {
    const gate = checkGate({
      mode: "task-promote-execute",
      tag: "task_promote",
      requestedAction: action
    });
    if (!gate.allowed) {
      steps.push({ action, status: "blocked", detail: gate.reason });
      return buildExecutionResult("blocked", steps);
    }

    for (const branch of input.targetBranches) {
      runner.run("git", ["push", "origin", `${input.targetCommit}:refs/heads/${branch}`], cwd);
      steps.push({
        action,
        status: "executed",
        detail: `${branch} -> ${input.targetCommit}`
      });
    }
  }

  return buildExecutionResult("executed", steps);
}

function missingFields(input: TaskPromoteInput): string[] {
  const missing: string[] = [];
  if (!input.targetCommit) {
    missing.push("target commit");
  }
  if (input.targetBranches.length === 0) {
    missing.push("target branches");
  }
  if (!input.verificationResult) {
    missing.push("verification result");
  }
  return missing;
}

function summarizeBranchStatus(input: TaskPromoteInput, branchStatus: TaskPromoteBranchStatus[]): string {
  if (input.targetBranches.length === 0) {
    return "missing target branches";
  }
  if (!input.targetCommit) {
    return "missing target commit";
  }
  if (branchStatus.length === 0) {
    return "branch status not loaded";
  }

  return branchStatus.map((status) => `${status.branch}: ${status.fastForward ? "fast-forward" : "blocked"} ${status.currentCommit} -> ${status.targetCommit}`).join("; ");
}

function isAncestor(cwd: string, ancestor: string, descendant: string): boolean {
  try {
    runGit(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
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

export function buildTaskPromoteNextWorkReview(input: NextWorkReviewInput = {}): string {
  const nextPrompt = input.nextPrompt ?? [
    "#태스크시작{",
    "작업지시: HCP 태스크 테이블 생성",
    "작업범위: hcp.harness_task와 hcp.harness_task_event 테이블을 migration, baseline, test에 추가하고 DSN-008 기준과 한글 COMMENT를 반영한다",
    "제외범위: HCP PR/Backlog 테이블 생성, JSON↔DB write-store 전환, DSN-008 history snapshot",
    "완료조건: task/task_event 테이블이 baseline과 migration에 반영되고 FK 없이 session_id/task_id 논리 참조 정책과 한글 COMMENT가 테스트로 확인된다",
    "검증방법: npm test, npm run check, DB migration/baseline 관련 테스트",
    "}"
  ].join("\n");

  return [
    "## Next Work Review",
    "",
    `- current issue: ${input.issueNumber ? `#${input.issueNumber}` : "check session linked issue before closing"}`,
    `- open PRs: ${input.openPullRequestCount ?? "check required"}`,
    `- unfinished HCP tasks: ${input.unfinishedTaskCount ?? "check required"}`,
    "- issue close: defer to #세션정리",
    "- recommended next prompt:",
    "",
    "```text",
    nextPrompt,
    "```"
  ].join("\n");
}

function buildExecutionResult(status: TaskPromoteExecutionResult["status"], steps: TaskPromoteExecutionResult["steps"]): TaskPromoteExecutionResult {
  const markdown = [
    "# Harness CLI task promote execution",
    "",
    `status: ${status}`,
    "",
    "## Steps",
    "",
    ...(steps.length === 0 ? ["- [skipped] execution: not requested"] : steps.map((step) => `- [${step.status}] ${step.action}: ${step.detail}`)),
    ...(status === "executed" ? ["", buildTaskPromoteNextWorkReview()] : [])
  ].join("\n");

  return {
    status,
    markdown: `${markdown}\n`,
    steps
  };
}
