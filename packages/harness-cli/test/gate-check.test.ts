import assert from "node:assert/strict";
import { test } from "node:test";

import { checkGate } from "../src/gates/check-gate.ts";

test("gate check blocks write actions for read/check/report mode", () => {
  const result = checkGate({
    mode: "read-check-report",
    requestedAction: "merge_pr",
    tag: "task_promote"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "write action is outside read/check/report scope");
  assert.equal(result.nextState, "report_only");
});

test("gate check allows report creation", () => {
  const result = checkGate({
    mode: "read-check-report",
    requestedAction: "create_report",
    tag: "session_start"
  });

  assert.equal(result.allowed, true);
  assert.equal(result.nextState, "execute");
});
