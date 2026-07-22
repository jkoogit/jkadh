import { policiesPassed, type PolicyResult } from "./stage-policy.ts";

export type PolicyRemediationLoopStatus = "completed" | "blocked" | "no_progress" | "max_iterations";

export interface PolicyRemediationAction {
  changed: boolean;
  appliedFixes: string[];
  nextAction?: string;
  requiresUser?: boolean;
}

export interface PolicyRemediationIteration {
  iteration: number;
  evaluatedPolicies: PolicyResult[];
  blockedPolicies: string[];
  appliedFixes: string[];
  fingerprint: string;
  result: "passed" | "remediated" | "blocked" | "no_progress";
  nextAction?: string;
}

export interface PolicyRemediationLoopResult {
  status: PolicyRemediationLoopStatus;
  iterations: PolicyRemediationIteration[];
  finalPolicies: PolicyResult[];
  nextAction?: string;
}

export interface PolicyRemediationLoopInput {
  maxIterations?: number;
  evaluate(): PolicyResult[];
  remediate(blocked: PolicyResult[], iteration: number): PolicyRemediationAction;
}

export function runPolicyRemediationLoop(input: PolicyRemediationLoopInput): PolicyRemediationLoopResult {
  const maxIterations = Math.max(1, input.maxIterations ?? 3);
  const iterations: PolicyRemediationIteration[] = [];
  let previousFingerprint: string | undefined;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const evaluatedPolicies = input.evaluate();
    const blocked = evaluatedPolicies.filter((result) => result.status === "blocked");
    const fingerprint = policyFingerprint(blocked);
    if (policiesPassed(evaluatedPolicies)) {
      iterations.push({
        iteration,
        evaluatedPolicies,
        blockedPolicies: [],
        appliedFixes: [],
        fingerprint,
        result: "passed"
      });
      return { status: "completed", iterations, finalPolicies: evaluatedPolicies };
    }

    if (fingerprint === previousFingerprint) {
      iterations.push({
        iteration,
        evaluatedPolicies,
        blockedPolicies: blocked.map((result) => result.policyId),
        appliedFixes: [],
        fingerprint,
        result: "no_progress",
        nextAction: "policy results did not change; user decision or scope change required"
      });
      return {
        status: "no_progress",
        iterations,
        finalPolicies: evaluatedPolicies,
        nextAction: iterations.at(-1)?.nextAction
      };
    }

    const action = input.remediate(blocked, iteration);
    iterations.push({
      iteration,
      evaluatedPolicies,
      blockedPolicies: blocked.map((result) => result.policyId),
      appliedFixes: action.appliedFixes,
      fingerprint,
      result: action.requiresUser ? "blocked" : action.changed ? "remediated" : "no_progress",
      nextAction: action.nextAction
    });
    if (action.requiresUser) {
      return { status: "blocked", iterations, finalPolicies: evaluatedPolicies, nextAction: action.nextAction };
    }
    if (!action.changed) {
      return { status: "no_progress", iterations, finalPolicies: evaluatedPolicies, nextAction: action.nextAction };
    }
    previousFingerprint = fingerprint;
  }

  const finalPolicies = input.evaluate();
  return {
    status: policiesPassed(finalPolicies) ? "completed" : "max_iterations",
    iterations,
    finalPolicies,
    nextAction: policiesPassed(finalPolicies) ? undefined : `maximum remediation iterations reached (${maxIterations})`
  };
}

export function policyFingerprint(results: PolicyResult[]): string {
  return JSON.stringify(results.map((result) => ({
    policyId: result.policyId,
    status: result.status,
    reason: result.reason,
    evidence: result.evidence ?? null
  })));
}
