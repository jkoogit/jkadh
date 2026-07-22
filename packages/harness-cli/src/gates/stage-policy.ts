export type HarnessStage = "task_start" | "task_process" | "task_close" | "task_promote" | "session_close";

export type PolicyStatus = "pass" | "blocked" | "info";

export interface PolicyResult {
  policyId: string;
  stage: HarnessStage;
  status: PolicyStatus;
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface StagePolicyContext {
  facts: Record<string, unknown>;
}

export interface StagePolicy {
  policyId: string;
  stage: HarnessStage;
  evaluate(context: StagePolicyContext): PolicyResult;
}

function requiredFactPolicy(stage: HarnessStage, policyId: string, fact: string, reason: string): StagePolicy {
  return {
    policyId,
    stage,
    evaluate(context) {
      const value = context.facts[fact];
      const passed = value === true || (typeof value === "string" && value.trim().length > 0);
      return {
        policyId,
        stage,
        status: passed ? "pass" : "blocked",
        reason: passed ? `${fact} confirmed` : reason,
        evidence: { [fact]: value ?? null }
      };
    }
  };
}

const registry: StagePolicy[] = [
  requiredFactPolicy("task_start", "task-start.identifier", "identifier", "issue or work order is required"),
  requiredFactPolicy("task_start", "task-start.scope", "scope", "scope is required"),
  requiredFactPolicy("task_start", "task-start.completion", "completionCriteria", "completion criteria are required"),
  requiredFactPolicy("task_process", "task-process.active-session", "activeSession", "an active HCP session is required"),
  requiredFactPolicy("task_process", "task-process.active-task", "activeTask", "exactly one active HCP task is required"),
  requiredFactPolicy("task_process", "task-process.branch", "branchMatches", "current branch must match the registered task branch"),
  requiredFactPolicy("task_process", "task-process.scope", "scopeAvailable", "task scope must be available before implementation"),
  requiredFactPolicy("task_close", "task-close.active-task", "activeTask", "an active HCP task is required"),
  requiredFactPolicy("task_close", "task-close.completion", "completionSummary", "completion summary is required"),
  requiredFactPolicy("task_close", "task-close.verification", "verificationResult", "verification result is required"),
  requiredFactPolicy("task_promote", "task-promote.closed-task", "closedTask", "a closed HCP task is required"),
  requiredFactPolicy("task_promote", "task-promote.close-evidence", "closeEvidencePassed", "passing task close evidence is required"),
  requiredFactPolicy("task_promote", "task-promote.pull-request", "pullRequestLinked", "a linked pull request is required"),
  requiredFactPolicy("task_promote", "task-promote.dev-merge", "devContainsTarget", "origin/dev must contain the target commit"),
  requiredFactPolicy("session_close", "session-close.no-unfinished-task", "noUnfinishedTask", "active or closed tasks remain"),
  requiredFactPolicy("session_close", "session-close.retrospective", "retrospectiveReady", "retrospective is required")
];

export function getStagePolicies(stage: HarnessStage): StagePolicy[] {
  return registry.filter((policy) => policy.stage === stage);
}

export function evaluateStagePolicies(stage: HarnessStage, facts: Record<string, unknown>): PolicyResult[] {
  return getStagePolicies(stage).map((policy) => policy.evaluate({ facts }));
}

export function policiesPassed(results: PolicyResult[]): boolean {
  return results.every((result) => result.status !== "blocked");
}
