import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTaskStartReport, parseTaskStartArgs, parseTaskStartBlock } from "../src/flows/task-start.ts";

test("task start arg parser accepts issue and required planning fields", () => {
  const input = parseTaskStartArgs([
    "--issue",
    "64",
    "--scope",
    "Harness CLI task start",
    "--out-of-scope",
    "PR merge",
    "--completion",
    "tests pass",
    "--verification",
    "npm test"
  ]);

  assert.deepEqual(input, {
    issueNumber: 64,
    scope: "Harness CLI task start",
    outOfScope: "PR merge",
    completionCriteria: "tests pass",
    verificationMethod: "npm test"
  });
});

test("task start report is ready when all required inputs are present", () => {
  const report = buildTaskStartReport({
    issueNumber: 64,
    scope: "Harness CLI task start",
    outOfScope: "PR merge",
    completionCriteria: "tests pass",
    verificationMethod: "npm test"
  });

  assert.equal(report.status, "ready");
  assert.equal(report.json.recommendedBranchName, "task_codex/064-harness-cli-task-start");
  assert.match(report.markdown, /task identifier: issue #64/);
  assert.match(report.markdown, /start readiness: ready/);
});

test("task start report is blocked when required inputs are missing", () => {
  const report = buildTaskStartReport({
    scope: "Harness CLI task start"
  });

  assert.equal(report.status, "blocked");
  assert.match(report.markdown, /missing: issue or work order; out of scope; completion criteria; verification method/);
});

test("task start block parser accepts Korean word aliases", () => {
  const input = parseTaskStartBlock(`#태스크시작{
이슈: #64
작업범위: Harness CLI task start alias support
제외범위: PR merge
완료조건: aliases are parsed
검증방법: npm test
}`);

  assert.deepEqual(input, {
    issueNumber: 64,
    scope: "Harness CLI task start alias support",
    outOfScope: "PR merge",
    completionCriteria: "aliases are parsed",
    verificationMethod: "npm test"
  });
});

test("task start block parser accepts English short aliases", () => {
  const input = parseTaskStartBlock(`#태스크시작{
i: #64
s: Harness CLI task start alias support
o: PR merge
c: aliases are parsed
v: npm test
}`);

  assert.deepEqual(input, {
    issueNumber: 64,
    scope: "Harness CLI task start alias support",
    outOfScope: "PR merge",
    completionCriteria: "aliases are parsed",
    verificationMethod: "npm test"
  });
});

test("task start block parser accepts English long aliases", () => {
  const input = parseTaskStartBlock(`#태스크시작{
issue: 64
scope: Harness CLI task start alias support
outOfScope: PR merge
completion: aliases are parsed
verification: npm test
}`);

  assert.deepEqual(input, {
    issueNumber: 64,
    scope: "Harness CLI task start alias support",
    outOfScope: "PR merge",
    completionCriteria: "aliases are parsed",
    verificationMethod: "npm test"
  });
});
