import type { HarnessAction, HarnessTag } from "../gates/check-gate.ts";
import { checkGate } from "../gates/check-gate.ts";
import { createReportDocument } from "../reports/create-report.ts";

export interface LifecycleFlow {
  tag: HarnessTag;
  command: "session start" | "task start" | "task close" | "task promote" | "session close";
  responsibility: string;
  checks: string[];
  writeActions: HarnessAction[];
}

export interface LifecycleReport {
  command: LifecycleFlow["command"];
  status: "ready" | "report_only";
  markdown: string;
  json: LifecycleFlow;
  blockedActions: HarnessAction[];
}

const flows: Record<HarnessTag, LifecycleFlow> = {
  session_start: {
    tag: "session_start",
    command: "session start",
    responsibility: "Read repository, branch, environment, and backlog state before work starts.",
    checks: ["branch alignment", "worktree status", "credential status", "backlog candidates"],
    writeActions: ["create_issue", "merge_pr", "promote_branch"]
  },
  task_start: {
    tag: "task_start",
    command: "task start",
    responsibility: "Check task identifier, scope, branch, and verification inputs before implementation.",
    checks: ["issue or work order", "scope", "out of scope", "completion criteria", "verification method"],
    writeActions: ["create_issue", "create_branch"]
  },
  task_close: {
    tag: "task_close",
    command: "task close",
    responsibility: "Check completion evidence, then prepare task-level commit, push, PR creation, and PR merge.",
    checks: ["diff summary", "verification result", "completion criteria", "remaining work", "PR readiness"],
    writeActions: ["commit_changes", "push_branch", "create_pr", "merge_pr"]
  },
  task_promote: {
    tag: "task_promote",
    command: "task promote",
    responsibility: "Check merged task changes and promote them to the configured target branches.",
    checks: ["merged PR commit", "target branch", "promotion branch alignment", "verification result"],
    writeActions: ["promote_branch"]
  },
  session_close: {
    tag: "session_close",
    command: "session close",
    responsibility: "Update session retrospective documents, unresolved work documents, and close verified issues.",
    checks: ["completed tasks", "session name update", "issue update", "backlog issue PR remainder", "retrospective", "next session handoff"],
    writeActions: ["close_issue"]
  }
};

export function getLifecycleFlow(tag: HarnessTag): LifecycleFlow {
  return flows[tag];
}

export function buildLifecycleReport(tag: HarnessTag): LifecycleReport {
  const flow = getLifecycleFlow(tag);
  const blockedActions = flow.writeActions.filter((action) => !checkGate({
    mode: "read-check-report",
    tag,
    requestedAction: action
  }).allowed);

  const report = createReportDocument({
    title: `Harness CLI ${flow.command}`,
    summary: flow.responsibility,
    checks: [
      {
        name: "tag",
        status: "info",
        detail: flow.tag
      },
      {
        name: "required checks",
        status: "info",
        detail: flow.checks.join("; ")
      },
      {
        name: "write actions",
        status: "blocked",
        detail: blockedActions.map((action) => `${action} blocked`).join("; ")
      }
    ]
  });

  return {
    command: flow.command,
    status: blockedActions.length > 0 ? "report_only" : "ready",
    markdown: report.markdown,
    json: flow,
    blockedActions
  };
}
