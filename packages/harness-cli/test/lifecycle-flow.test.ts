import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLifecycleReport, getLifecycleFlow } from "../src/flows/lifecycle-flow.ts";

test("lifecycle registry defines six Harness tag flows", () => {
  assert.equal(getLifecycleFlow("session_start").command, "session start");
  assert.equal(getLifecycleFlow("task_start").command, "task start");
  assert.equal(getLifecycleFlow("task_process").command, "task process");
  assert.equal(getLifecycleFlow("task_close").command, "task close");
  assert.equal(getLifecycleFlow("task_promote").command, "task promote");
  assert.equal(getLifecycleFlow("session_close").command, "session close");
});

test("lifecycle report blocks write actions in read/check/report mode", () => {
  const report = buildLifecycleReport("task_promote");

  assert.equal(report.command, "task promote");
  assert.equal(report.status, "report_only");
  assert.match(report.markdown, /write actions: promote_branch blocked/);
  assert.deepEqual(report.blockedActions, ["promote_branch"]);
});

test("issue closing belongs only to session close flow", () => {
  assert.equal(getLifecycleFlow("task_close").writeActions.includes("close_issue"), false);
  assert.equal(getLifecycleFlow("task_promote").writeActions.includes("close_issue"), false);
  assert.equal(getLifecycleFlow("session_close").writeActions.includes("close_issue"), true);
});

test("session close report keeps issue closing blocked until explicit execution mode exists", () => {
  const report = buildLifecycleReport("session_close");

  assert.equal(report.command, "session close");
  assert.match(report.markdown, /close_issue blocked/);
});
