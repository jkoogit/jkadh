import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLifecycleReport, getLifecycleFlow } from "../src/flows/lifecycle-flow.ts";

test("lifecycle registry defines five Harness tag flows", () => {
  assert.equal(getLifecycleFlow("session_start").command, "session start");
  assert.equal(getLifecycleFlow("task_start").command, "task start");
  assert.equal(getLifecycleFlow("task_close").command, "task close");
  assert.equal(getLifecycleFlow("task_promote").command, "task promote");
  assert.equal(getLifecycleFlow("session_close").command, "session close");
});

test("lifecycle report blocks write actions in read/check/report mode", () => {
  const report = buildLifecycleReport("task_promote");

  assert.equal(report.command, "task promote");
  assert.equal(report.status, "report_only");
  assert.match(report.markdown, /write actions: merge_pr blocked; promote_branch blocked/);
  assert.deepEqual(report.blockedActions, ["merge_pr", "promote_branch", "close_issue"]);
});

test("session close report keeps issue closing blocked in second implementation", () => {
  const report = buildLifecycleReport("session_close");

  assert.equal(report.command, "session close");
  assert.match(report.markdown, /close_issue blocked/);
});
