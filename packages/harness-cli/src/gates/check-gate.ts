export type HarnessMode =
  | "read-check-report"
  | "task-start-execute"
  | "task-close-execute"
  | "task-promote-execute"
  | "session-close-execute";

export type HarnessAction =
  | "read_status"
  | "check_gate"
  | "create_report"
  | "create_issue"
  | "create_branch"
  | "commit_changes"
  | "push_branch"
  | "create_pr"
  | "merge_pr"
  | "merge_pr_to_dev"
  | "write_retrospective"
  | "update_issue"
  | "promote_branch"
  | "close_issue";

export type HarnessTag =
  | "session_start"
  | "task_start"
  | "task_close"
  | "task_promote"
  | "session_close";

export interface GateCheckInput {
  mode: HarnessMode;
  requestedAction: HarnessAction;
  tag: HarnessTag;
}

export interface GateCheckResult {
  allowed: boolean;
  reason: string;
  nextState: "execute" | "report_only";
  tag: HarnessTag;
  requestedAction: HarnessAction;
}

const readCheckReportActions = new Set<HarnessAction>([
  "read_status",
  "check_gate",
  "create_report"
]);

export function checkGate(input: GateCheckInput): GateCheckResult {
  if (input.mode === "read-check-report" && readCheckReportActions.has(input.requestedAction)) {
    return {
      allowed: true,
      reason: "action is inside read/check/report scope",
      nextState: "execute",
      tag: input.tag,
      requestedAction: input.requestedAction
    };
  }

  if (input.mode === "task-close-execute"
    && input.tag === "task_close"
    && taskCloseExecuteActions.has(input.requestedAction)) {
    return {
      allowed: true,
      reason: "action is inside task close execution scope",
      nextState: "execute",
      tag: input.tag,
      requestedAction: input.requestedAction
    };
  }

  if (input.mode === "task-start-execute"
    && input.tag === "task_start"
    && taskStartExecuteActions.has(input.requestedAction)) {
    return {
      allowed: true,
      reason: "action is inside task start execution scope",
      nextState: "execute",
      tag: input.tag,
      requestedAction: input.requestedAction
    };
  }

  if (input.mode === "task-promote-execute"
    && input.tag === "task_promote"
    && taskPromoteExecuteActions.has(input.requestedAction)) {
    return {
      allowed: true,
      reason: "action is inside task promote execution scope",
      nextState: "execute",
      tag: input.tag,
      requestedAction: input.requestedAction
    };
  }

  if (input.mode === "session-close-execute"
    && input.tag === "session_close"
    && sessionCloseExecuteActions.has(input.requestedAction)) {
    return {
      allowed: true,
      reason: "action is inside session close execution scope",
      nextState: "execute",
      tag: input.tag,
      requestedAction: input.requestedAction
    };
  }

  return {
    allowed: false,
    reason: "write action is outside read/check/report scope",
    nextState: "report_only",
    tag: input.tag,
    requestedAction: input.requestedAction
  };
}

const taskStartExecuteActions = new Set<HarnessAction>([
  "read_status",
  "check_gate",
  "create_report",
  "create_issue",
  "create_branch"
]);

const taskCloseExecuteActions = new Set<HarnessAction>([
  "read_status",
  "check_gate",
  "create_report",
  "commit_changes",
  "push_branch",
  "create_pr",
  "merge_pr",
  "merge_pr_to_dev"
]);

const taskPromoteExecuteActions = new Set<HarnessAction>([
  "read_status",
  "check_gate",
  "create_report",
  "promote_branch"
]);

const sessionCloseExecuteActions = new Set<HarnessAction>([
  "read_status",
  "check_gate",
  "create_report",
  "write_retrospective",
  "update_issue",
  "commit_changes",
  "push_branch",
  "create_pr",
  "merge_pr",
  "promote_branch",
  "close_issue"
]);
