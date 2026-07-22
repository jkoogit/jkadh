import { evaluateStagePolicies, policiesPassed, type PolicyResult } from "../gates/stage-policy.ts";
import { runPolicyRemediationLoop, type PolicyRemediationLoopResult } from "../gates/policy-remediation-loop.ts";
import { createReportDocument } from "../reports/create-report.ts";

export interface TaskProcessInput {
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  scope?: string;
  currentBranch?: string;
  registeredBranch?: string;
  activeSession?: boolean;
  activeTask?: boolean;
  execution?: { enabled: boolean };
  maxIterations?: number;
}

export interface TaskProcessReport {
  command: "task process";
  status: "ready" | "blocked";
  markdown: string;
  json: {
    input: TaskProcessInput;
    policyResults: PolicyResult[];
    remediation: PolicyRemediationLoopResult;
  };
  blockedActions: string[];
}

export function parseTaskProcessArgs(args: string[]): TaskProcessInput {
  const input: TaskProcessInput = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--execute") {
      input.execution = { enabled: true };
      continue;
    }
    const value = args[index + 1];
    if (!value) {
      continue;
    }
    if (key === "--agent-id") input.agentId = value;
    if (key === "--session-id") input.sessionId = value;
    if (key === "--task-id") input.taskId = value;
    if (key === "--scope") input.scope = value;
    if (key === "--max-iterations") input.maxIterations = Number(value);
    if (["--agent-id", "--session-id", "--task-id", "--scope", "--max-iterations"].includes(key ?? "")) index += 1;
  }
  return input;
}

export function buildTaskProcessReport(input: TaskProcessInput): TaskProcessReport {
  const evaluate = () => evaluateStagePolicies("task_process", {
      activeSession: input.activeSession === true,
      activeTask: input.activeTask === true,
      branchMatches: Boolean(input.currentBranch && input.currentBranch === input.registeredBranch),
      scopeAvailable: Boolean(input.scope?.trim())
    });
  const remediation = runPolicyRemediationLoop({
    maxIterations: input.maxIterations,
    evaluate,
    remediate(blocked) {
      return {
        changed: false,
        appliedFixes: [],
        requiresUser: true,
        nextAction: taskProcessRecoveryAction(blocked)
      };
    }
  });
  const policyResults = remediation.finalPolicies;
  const ready = policiesPassed(policyResults);
  const blockedActions = ["commit_changes", "push_branch", "create_pr", "merge_pr_to_dev", "promote_branch", "close_issue"];
  const report = createReportDocument({
    title: "Harness CLI task process",
    summary: "Check the active task boundary before implementation.",
    checks: [
      {
        name: "stage policies",
        status: ready ? "pass" : "blocked",
        detail: policyResults.map((result) => `${result.policyId}=${result.status}`).join("; ")
      },
      {
        name: "task branch",
        status: input.currentBranch && input.currentBranch === input.registeredBranch ? "pass" : "blocked",
        detail: `${input.currentBranch ?? "missing"} / ${input.registeredBranch ?? "missing"}`
      },
      {
        name: "remediation loop",
        status: remediation.status === "completed" ? "pass" : "blocked",
        detail: `${remediation.status}; iterations=${remediation.iterations.length}; next=${remediation.nextAction ?? "none"}`
      },
      {
        name: "write boundary",
        status: "info",
        detail: `${blockedActions.join(", ")} remain reserved for later lifecycle stages`
      }
    ]
  });
  return {
    command: "task process",
    status: ready ? "ready" : "blocked",
    markdown: report.markdown,
    json: { input, policyResults, remediation },
    blockedActions
  };
}

function taskProcessRecoveryAction(blocked: PolicyResult[]): string {
  const ids = new Set(blocked.map((result) => result.policyId));
  if (ids.has("task-process.active-session") || ids.has("task-process.active-task")) {
    return "run #태스크시작 or select sessionId/taskId";
  }
  if (ids.has("task-process.branch")) {
    return "checkout the registered task branch or update the HCP branch intentionally";
  }
  return "provide the structured task scope before implementation";
}
