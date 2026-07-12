import { execFileSync } from "node:child_process";

import { checkGate, type HarnessAction } from "../gates/check-gate.ts";
import { createReportDocument } from "../reports/create-report.ts";

export interface SessionCloseInput {
  completedTasks: string[];
  sessionName?: string;
  issueUpdate?: string;
  remainingWork?: string;
  retrospective?: string;
  handoff?: string;
  unresolvedDocs: string[];
  verifiedIssueNumbers: number[];
  execution?: SessionCloseExecutionOptions;
}

export interface SessionCloseExecutionOptions {
  enabled: boolean;
}

export interface SessionCloseReport {
  command: "session close";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    input: SessionCloseInput;
    missing: string[];
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

const blockedActions = ["close_issue"];
const executionActions: HarnessAction[] = ["close_issue"];

export function parseSessionCloseArgs(args: string[]): SessionCloseInput {
  const input: SessionCloseInput = {
    completedTasks: [],
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  };
  const execution: SessionCloseExecutionOptions = {
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
  }

  if (execution.enabled) {
    input.execution = execution;
  }

  return input;
}

export function buildSessionCloseReport(input: SessionCloseInput): SessionCloseReport {
  const missing = missingFields(input);
  const issueCloseReady = input.verifiedIssueNumbers.length > 0;
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
        detail: input.sessionName ?? "missing"
      },
      {
        name: "issue update",
        status: input.issueUpdate ? "pass" : "blocked",
        detail: input.issueUpdate ?? "missing"
      },
      {
        name: "remaining backlog issue PR",
        status: input.remainingWork ? "pass" : "blocked",
        detail: input.remainingWork ?? "missing"
      },
      {
        name: "retrospective",
        status: input.retrospective ? "pass" : "blocked",
        detail: input.retrospective ?? "missing"
      },
      {
        name: "unresolved work docs",
        status: input.unresolvedDocs.length > 0 ? "info" : "pass",
        detail: input.unresolvedDocs.length > 0 ? input.unresolvedDocs.join("; ") : "none"
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
      }
    ]
  });

  return {
    command: "session close",
    status,
    markdown: report.markdown,
    json: {
      input,
      missing,
      issueCloseReady
    },
    blockedActions
  };
}

export function executeSessionClose(input: SessionCloseInput, cwd: string, runner: CommandRunner = defaultCommandRunner): SessionCloseExecutionResult {
  if (!input.execution?.enabled) {
    return buildExecutionResult("skipped", []);
  }

  const report = buildSessionCloseReport(input);
  if (report.status !== "ready") {
    return buildExecutionResult("blocked", [{
      action: "close_issue",
      status: "blocked",
      detail: "session close report is not ready"
    }]);
  }
  if (!report.json.issueCloseReady) {
    return buildExecutionResult("blocked", [{
      action: "close_issue",
      status: "blocked",
      detail: "no verified issue close candidate"
    }]);
  }

  const steps: SessionCloseExecutionResult["steps"] = [];
  for (const action of executionActions) {
    const gate = checkGate({
      mode: "session-close-execute",
      tag: "session_close",
      requestedAction: action
    });
    if (!gate.allowed) {
      steps.push({ action, status: "blocked", detail: gate.reason });
      return buildExecutionResult("blocked", steps);
    }

    for (const issueNumber of input.verifiedIssueNumbers) {
      runner.run("gh", ["issue", "close", String(issueNumber), "--comment", "Closed by verified #세션정리."], cwd);
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
  if (!input.issueUpdate) {
    missing.push("issue update");
  }
  if (!input.remainingWork) {
    missing.push("remaining backlog issue PR");
  }
  if (!input.retrospective) {
    missing.push("retrospective");
  }
  if (!input.handoff) {
    missing.push("next session handoff");
  }
  return missing;
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
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
