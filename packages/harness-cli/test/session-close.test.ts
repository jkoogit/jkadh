import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSessionCloseReport, executeSessionClose, parseSessionCloseArgs } from "../src/flows/session-close.ts";

test("session close arg parser accepts closure fields and verified issues", () => {
  const input = parseSessionCloseArgs([
    "--completed-task",
    "Harness task promote execution mode",
    "--session-name",
    "Harness CLI execution modes",
    "--issue-update",
    "Issue #64 updated",
    "--remaining",
    "No open PR",
    "--retrospective",
    "RET draft ready",
    "--handoff",
    "Next: report suffix backlog",
    "--unresolved-doc",
    "BLG report suffix",
    "--verified-issue",
    "#64",
    "--execute"
  ]);

  assert.deepEqual(input, {
    completedTasks: ["Harness task promote execution mode"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next: report suffix backlog",
    unresolvedDocs: ["BLG report suffix"],
    verifiedIssueNumbers: [64],
    execution: {
      enabled: true
    }
  });
});

test("session close report is ready with required closure evidence", () => {
  const report = buildSessionCloseReport({
    completedTasks: ["task start", "task close", "task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64]
  });

  assert.equal(report.status, "ready");
  assert.equal(report.json.issueCloseReady, true);
  assert.match(report.markdown, /issue close readiness: #64/);
});

test("session close report is blocked when required closure evidence is missing", () => {
  const report = buildSessionCloseReport({
    completedTasks: [],
    unresolvedDocs: [],
    verifiedIssueNumbers: []
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.json.missing, [
    "completed tasks",
    "session name",
    "issue update",
    "remaining backlog issue PR",
    "retrospective",
    "next session handoff"
  ]);
});

test("session close execution blocks without verified issue candidates", () => {
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [],
    execution: {
      enabled: true
    }
  }, "repo");

  assert.equal(result.status, "blocked");
  assert.match(result.markdown, /no verified issue close candidate/);
});

test("session close execution closes verified issues only", () => {
  const calls: string[] = [];
  const result = executeSessionClose({
    completedTasks: ["task promote"],
    sessionName: "Harness CLI execution modes",
    issueUpdate: "Issue #64 updated",
    remainingWork: "No open PR",
    retrospective: "RET draft ready",
    handoff: "Next session starts from report suffix backlog",
    unresolvedDocs: [],
    verifiedIssueNumbers: [64],
    execution: {
      enabled: true
    }
  }, "repo", {
    run(command, args) {
      calls.push([command, ...args].join(" "));
      return "";
    }
  });

  assert.equal(result.status, "executed");
  assert.equal(calls[0], "gh issue close 64 --comment Closed by verified #세션정리.");
});
