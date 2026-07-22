import assert from "node:assert/strict";
import { test } from "node:test";

import { runPolicyRemediationLoop } from "../src/gates/policy-remediation-loop.ts";
import { evaluateStagePolicies } from "../src/gates/stage-policy.ts";

test("policy remediation loop converges after an allowed fix", () => {
  let branchMatches = false;
  const result = runPolicyRemediationLoop({
    maxIterations: 3,
    evaluate: () => evaluateStagePolicies("task_process", {
      activeSession: true,
      activeTask: true,
      branchMatches,
      scopeAvailable: true
    }),
    remediate(blocked) {
      assert.deepEqual(blocked.map((policy) => policy.policyId), ["task-process.branch"]);
      branchMatches = true;
      return { changed: true, appliedFixes: ["checkout registered branch"] };
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.iterations.length, 2);
  assert.equal(result.iterations[0].result, "remediated");
  assert.equal(result.iterations[1].result, "passed");
});

test("policy remediation loop stops when user input is required", () => {
  const result = runPolicyRemediationLoop({
    evaluate: () => evaluateStagePolicies("task_process", {
      activeSession: false,
      activeTask: false,
      branchMatches: false,
      scopeAvailable: false
    }),
    remediate: () => ({
      changed: false,
      appliedFixes: [],
      requiresUser: true,
      nextAction: "run #태스크시작"
    })
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.iterations.length, 1);
  assert.equal(result.nextAction, "run #태스크시작");
});

test("policy remediation loop stops on repeated policy fingerprint", () => {
  const result = runPolicyRemediationLoop({
    maxIterations: 3,
    evaluate: () => evaluateStagePolicies("task_process", {
      activeSession: true,
      activeTask: true,
      branchMatches: false,
      scopeAvailable: true
    }),
    remediate: () => ({ changed: true, appliedFixes: ["attempted branch recovery"] })
  });

  assert.equal(result.status, "no_progress");
  assert.equal(result.iterations.length, 2);
  assert.equal(result.iterations[1].result, "no_progress");
});
