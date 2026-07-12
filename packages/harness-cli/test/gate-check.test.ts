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

test("gate check allows task close execution actions only in task close execution mode", () => {
  const allowed = checkGate({
    mode: "task-close-execute",
    requestedAction: "create_pr",
    tag: "task_close"
  });
  const blocked = checkGate({
    mode: "task-close-execute",
    requestedAction: "close_issue",
    tag: "task_close"
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, "action is inside task close execution scope");
  assert.equal(blocked.allowed, false);
});

test("gate check allows only branch creation in task start execution mode", () => {
  const allowed = checkGate({
    mode: "task-start-execute",
    requestedAction: "create_branch",
    tag: "task_start"
  });
  const blocked = checkGate({
    mode: "task-start-execute",
    requestedAction: "create_issue",
    tag: "task_start"
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.reason, "action is inside task start execution scope");
  assert.equal(blocked.allowed, false);
});
