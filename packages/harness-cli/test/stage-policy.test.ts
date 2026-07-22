import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateStagePolicies, getStagePolicies, policiesPassed } from "../src/gates/stage-policy.ts";

test("stage policy registry covers all controlled lifecycle stages", () => {
  assert.ok(getStagePolicies("task_start").length > 0);
  assert.ok(getStagePolicies("task_process").length > 0);
  assert.ok(getStagePolicies("task_close").length > 0);
  assert.ok(getStagePolicies("task_promote").length > 0);
  assert.ok(getStagePolicies("session_close").length > 0);
});

test("stage policies return structured pass and blocked results", () => {
  const blocked = evaluateStagePolicies("task_promote", {
    closedTask: true,
    closeEvidencePassed: false,
    pullRequestLinked: true,
    devContainsTarget: false
  });

  assert.equal(policiesPassed(blocked), false);
  assert.deepEqual(blocked.map((result) => result.status), ["pass", "blocked", "pass", "blocked"]);
  assert.equal(blocked[1].policyId, "task-promote.close-evidence");
  assert.deepEqual(blocked[1].evidence, { closeEvidencePassed: false });
});
