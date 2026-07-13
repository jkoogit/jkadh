import { execFileSync } from "node:child_process";

import { checkGate, type HarnessAction } from "../gates/check-gate.ts";
import { createReportDocument } from "../reports/create-report.ts";

export interface TaskStartInput {
  agentId?: string;
  sessionId?: string;
  taskName?: string;
  issueNumber?: number;
  workOrderId?: string;
  scope?: string;
  outOfScope?: string;
  completionCriteria?: string;
  verificationMethod?: string;
  execution?: TaskStartExecutionOptions;
}

export interface TaskStartExecutionOptions {
  enabled: boolean;
  branchName?: string;
  startPoint: string;
  issueTitle?: string;
}

export interface TaskStartReport {
  command: "task start";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    input: TaskStartInput;
    missing: string[];
    recommendedBranchName?: string;
    suggestedOrder?: string;
  };
  blockedActions: string[];
}

const blockedActions = ["create_issue", "create_branch"];
const executionActions: HarnessAction[] = ["create_issue", "create_branch"];

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): string;
}

export interface TaskStartExecutionResult {
  status: "executed" | "blocked" | "skipped";
  markdown: string;
  steps: {
    action: HarnessAction;
    status: "executed" | "blocked" | "skipped";
    detail: string;
  }[];
}

export function parseTaskStartArgs(args: string[]): TaskStartInput {
  const input: TaskStartInput = {};
  const execution: TaskStartExecutionOptions = {
    enabled: false,
    startPoint: "origin/main"
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
    if (key === "--issue") {
      input.issueNumber = Number(value);
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
    if (key === "--task-name") {
      input.taskName = value;
      index += 1;
    }
    if (key === "--work-order") {
      input.workOrderId = value;
      index += 1;
    }
    if (key === "--scope") {
      input.scope = value;
      index += 1;
    }
    if (key === "--out-of-scope") {
      input.outOfScope = value;
      index += 1;
    }
    if (key === "--completion") {
      input.completionCriteria = value;
      index += 1;
    }
    if (key === "--verification") {
      input.verificationMethod = value;
      index += 1;
    }
    if (key === "--branch") {
      execution.branchName = value;
      index += 1;
    }
    if (key === "--issue-title") {
      execution.issueTitle = value;
      index += 1;
    }
    if (key === "--start-point") {
      execution.startPoint = value;
      index += 1;
    }
  }

  if (execution.enabled || execution.branchName || execution.issueTitle || execution.startPoint !== "origin/main") {
    input.execution = execution;
  }

  return input;
}

export function parseTaskStartBlock(block: string): TaskStartInput {
  const input: TaskStartInput = {};
  const body = block.match(/#태스크시작\s*\{([\s\S]*)\}/)?.[1] ?? block;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "}") {
      continue;
    }

    const match = line.match(/^([^:=]+)\s*[:=]\s*(.*)$/);
    if (!match) {
      continue;
    }

    applyTaskStartField(input, match[1].trim(), match[2].trim());
  }

  return input;
}

export function buildTaskStartReport(input: TaskStartInput): TaskStartReport {
  const missing = missingFields(input);
  const suggestedOrder = missing.length > 0 ? buildSuggestedTaskStartOrder(input) : undefined;
  const recommendedBranchName = input.issueNumber && input.scope
    ? `task_codex/${String(input.issueNumber).padStart(3, "0")}-${slugifyScope(input.scope)}`
    : undefined;
  const status = missing.length === 0 ? "ready" : "blocked";

  const report = createReportDocument({
    title: "Harness CLI task start",
    summary: "Check task start readiness before implementation.",
    checks: [
      {
        name: "task identifier",
        status: input.issueNumber || input.workOrderId ? "pass" : "blocked",
        detail: input.issueNumber ? `issue #${input.issueNumber}` : input.workOrderId ?? "missing"
      },
      {
        name: "scope",
        status: input.scope ? "pass" : "blocked",
        detail: input.scope ?? "missing"
      },
      {
        name: "out of scope",
        status: input.outOfScope ? "pass" : "blocked",
        detail: input.outOfScope ?? "missing"
      },
      {
        name: "completion criteria",
        status: input.completionCriteria ? "pass" : "blocked",
        detail: input.completionCriteria ?? "missing"
      },
      {
        name: "verification method",
        status: input.verificationMethod ? "pass" : "blocked",
        detail: input.verificationMethod ?? "missing"
      },
      {
        name: "start readiness",
        status: status === "ready" ? "pass" : "blocked",
        detail: status === "ready" ? "ready" : `suggested order generated; missing: ${missing.join("; ")}`
      },
      {
        name: "recommended branch",
        status: recommendedBranchName ? "info" : "blocked",
        detail: recommendedBranchName ?? "requires issue and scope"
      },
      {
        name: "write actions",
        status: "blocked",
        detail: blockedActions.map((action) => `${action} blocked`).join("; ")
      }
    ]
  });
  const markdown = suggestedOrder
    ? `${report.markdown}\n## Suggested Order\n\n동의하면 아래 주문서를 기준으로 진행한다.\n\n\`\`\`text\n${suggestedOrder}\n\`\`\`\n`
    : report.markdown;

  return {
    command: "task start",
    status,
    markdown,
    json: {
      input,
      missing,
      recommendedBranchName,
      suggestedOrder
    },
    blockedActions
  };
}

export function executeTaskStart(input: TaskStartInput, cwd: string, runner: CommandRunner = defaultCommandRunner): TaskStartExecutionResult {
  if (!input.execution?.enabled) {
    return buildExecutionResult("skipped", []);
  }

  const report = buildTaskStartReport(input);
  if (report.status !== "ready") {
    return buildExecutionResult("blocked", [{
      action: "create_branch",
      status: "blocked",
      detail: "task start report is not ready"
    }]);
  }

  const steps: TaskStartExecutionResult["steps"] = [];
  let issueNumber = input.issueNumber;
  for (const action of executionActions) {
    if (action === "create_issue" && issueNumber) {
      steps.push({ action, status: "skipped", detail: `using existing issue #${issueNumber}` });
      continue;
    }

    const gate = checkGate({
      mode: "task-start-execute",
      tag: "task_start",
      requestedAction: action
    });
    if (!gate.allowed) {
      steps.push({ action, status: "blocked", detail: gate.reason });
      return buildExecutionResult("blocked", steps);
    }

    if (action === "create_issue") {
      const step = runCreateIssueStep(input, cwd, runner);
      steps.push(step);
      const createdIssue = parseIssueNumber(step.detail);
      if (!createdIssue) {
        return buildExecutionResult("blocked", steps);
      }
      issueNumber = createdIssue;
      continue;
    }

    const branchName = input.execution.branchName
      ?? (issueNumber && input.scope ? `task_codex/${String(issueNumber).padStart(3, "0")}-${slugifyScope(input.scope)}` : undefined);
    if (!branchName) {
      steps.push({
        action: "create_branch",
        status: "blocked",
        detail: "branch name is required"
      });
      return buildExecutionResult("blocked", steps);
    }

    steps.push(runCreateBranchStep({
      branchName,
      startPoint: input.execution.startPoint
    }, cwd, runner));
  }

  return buildExecutionResult("executed", steps);
}

function buildSuggestedTaskStartOrder(input: TaskStartInput): string {
  const issue = input.issueNumber ? `#${input.issueNumber}` : "";
  const workOrder = input.workOrderId ?? "";
  const scope = input.scope ?? "Harness #태스크시작 빈 입력 시 자동 주문서 제안 기능을 구현한다.";
  const outOfScope = input.outOfScope ?? "Issue 자동 생성, 브랜치 자동 생성, PR 생성, PR 병합, dev/stg/main 승급은 제외한다.";
  const completion = input.completionCriteria
    ?? "#태스크시작 단독 실행 시 누락 항목만 표시하지 않고 동의 가능한 주문서 초안이 함께 출력된다.";
  const verification = input.verificationMethod ?? "npm test, npm run check, CLI dry-run으로 확인한다.";
  const identifierLine = issue ? `이슈: ${issue}` : `작업지시: ${workOrder || "확인필요"}`;

  return [
    "#태스크시작{",
    identifierLine,
    `작업범위: ${scope}`,
    `제외범위: ${outOfScope}`,
    `완료조건: ${completion}`,
    `검증방법: ${verification}`,
    "}"
  ].join("\n");
}

function missingFields(input: TaskStartInput): string[] {
  const missing: string[] = [];
  if (!input.issueNumber && !input.workOrderId) {
    missing.push("issue or work order");
  }
  if (!input.scope) {
    missing.push("scope");
  }
  if (!input.outOfScope) {
    missing.push("out of scope");
  }
  if (!input.completionCriteria) {
    missing.push("completion criteria");
  }
  if (!input.verificationMethod) {
    missing.push("verification method");
  }
  return missing;
}

function applyTaskStartField(input: TaskStartInput, key: string, value: string): void {
  const field = normalizeTaskStartField(key);
  if (!field || !value) {
    return;
  }

  if (field === "issueNumber") {
    const issueNumber = Number(value.replace(/^#/, ""));
    if (Number.isFinite(issueNumber)) {
      input.issueNumber = issueNumber;
    }
    return;
  }

  if (field === "workOrderId") {
    input.workOrderId = value;
    return;
  }

  input[field] = value;
}

function normalizeTaskStartField(key: string): keyof TaskStartInput | undefined {
  const normalized = key.replace(/\s+/g, "").toLowerCase();
  const aliases: Record<string, keyof TaskStartInput> = {
    agent: "agentId",
    agentid: "agentId",
    session: "sessionId",
    sessionid: "sessionId",
    task: "taskName",
    taskname: "taskName",
    i: "issueNumber",
    issue: "issueNumber",
    이슈: "issueNumber",
    w: "workOrderId",
    workorder: "workOrderId",
    작업지시: "workOrderId",
    s: "scope",
    scope: "scope",
    작업범위: "scope",
    o: "outOfScope",
    outofscope: "outOfScope",
    제외범위: "outOfScope",
    c: "completionCriteria",
    completion: "completionCriteria",
    완료조건: "completionCriteria",
    v: "verificationMethod",
    verification: "verificationMethod",
    검증방법: "verificationMethod"
  };

  return aliases[normalized];
}

function slugifyScope(scope: string): string {
  if (scope.toLowerCase().includes("task start")) {
    return "harness-cli-task-start";
  }

  return scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "task";
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

function runCreateIssueStep(
  input: TaskStartInput,
  cwd: string,
  runner: CommandRunner
): TaskStartExecutionResult["steps"][number] {
  const title = input.execution?.issueTitle ?? input.workOrderId ?? input.scope ?? "Harness task";
  const body = buildIssueBody(input);
  const output = runner.run("gh", ["issue", "create", "--title", title, "--body", body], cwd);
  const issueNumber = parseIssueNumber(output);
  return {
    action: "create_issue",
    status: issueNumber ? "executed" : "blocked",
    detail: issueNumber ? `created issue #${issueNumber}` : "issue creation did not return an issue number"
  };
}

function runCreateBranchStep(
  execution: { branchName: string; startPoint: string },
  cwd: string,
  runner: CommandRunner
): TaskStartExecutionResult["steps"][number] {
  runner.run("git", ["switch", "-c", execution.branchName, execution.startPoint], cwd);
  return {
    action: "create_branch",
    status: "executed",
    detail: `checked out ${execution.branchName} from ${execution.startPoint}`
  };
}

function buildIssueBody(input: TaskStartInput): string {
  return [
    "## Scope",
    "",
    input.scope ?? "TBD",
    "",
    "## Out Of Scope",
    "",
    input.outOfScope ?? "TBD",
    "",
    "## Completion",
    "",
    input.completionCriteria ?? "TBD",
    "",
    "## Verification",
    "",
    input.verificationMethod ?? "TBD"
  ].join("\n");
}

function parseIssueNumber(value: string): number | undefined {
  const match = value.match(/\/issues\/(\d+)|#(\d+)|created issue #(\d+)/i);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  const issueNumber = raw ? Number(raw) : NaN;
  return Number.isFinite(issueNumber) ? issueNumber : undefined;
}

function buildExecutionResult(status: TaskStartExecutionResult["status"], steps: TaskStartExecutionResult["steps"]): TaskStartExecutionResult {
  const markdown = [
    "# Harness CLI task start execution",
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
