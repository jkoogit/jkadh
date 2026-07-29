import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHarnessCompletionProtocol,
  getHarnessNextPromptConstraint
} from "../src/flows/harness-completion-protocol.ts";

test("session start execution can only recommend a structured task-start prompt", () => {
  const result = buildHarnessCompletionProtocol({
    tag: "session_start",
    outcome: "executed",
    nextPrompt: [
      "#태스크시작{",
      "sessionId: codex_ses_025_001",
      "작업지시: SESSION-025-TASK-001",
      "작업범위: 다음 작업을 구현한다",
      "제외범위: 관련 없는 작업은 제외한다",
      "완료조건: 구현과 검증이 완료된다",
      "검증방법: npm test",
      "}"
    ].join("\n")
  });

  assert.equal(result.status, "pass");
  assert.equal(result.nextTag, "#태스크시작");
  assert.match(result.markdown, /missing handling: confirmed/);
  assert.match(result.markdown, /```text\n#태스크시작\{/);
});

test("session start execution rejects a skipped task-process suggestion", () => {
  const result = buildHarnessCompletionProtocol({
    tag: "session_start",
    outcome: "executed",
    nextPrompt: [
      "#태스크처리{",
      "sessionId: codex_ses_025_001",
      "taskId: codex_task_025_001",
      "작업내용: 구현한다",
      "}"
    ].join("\n")
  });

  assert.equal(result.status, "blocked");
  assert.match(result.violations.join("; "), /#태스크처리 is not allowed; expected #태스크시작/);
  assert.doesNotMatch(result.markdown, /```text\n#태스크처리/);
});

test("protocol blocks executed outcomes that still have missing handling", () => {
  const result = buildHarnessCompletionProtocol({
    tag: "task_close",
    outcome: "executed",
    missingItems: ["verification result"],
    nextPrompt: [
      "#태스크승급{",
      "sessionId: codex_ses_025_001",
      "taskId: codex_task_025_001",
      "대상커밋: abc123",
      "대상브랜치: stg,main",
      "검증결과: npm test 통과",
      "}"
    ].join("\n")
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.missingHandling, "required");
  assert.match(result.violations.join("; "), /executed outcome retains missing items/);
});

test("task promote execution allows only state-derived continuation tags", () => {
  const constraint = getHarnessNextPromptConstraint("task_promote", "executed");

  assert.deepEqual(constraint.allowedTags, ["#태스크처리", "#태스크시작", "#세션정리"]);
  assert.doesNotMatch(constraint.allowedTags.join(" "), /#태스크승급/);
});

test("all Harness scope graph nodes define an explicit executed-state continuation constraint", () => {
  const matrix = {
    session_start: ["#태스크시작"],
    task_start: ["#태스크처리"],
    task_process: ["#태스크정리"],
    task_close: ["#태스크승급"],
    task_promote: ["#태스크처리", "#태스크시작", "#세션정리"],
    session_close: ["#세션시작"],
    loop_analyze: ["#루프실행"],
    loop_execute: ["#루프실행", "#루프보완", "#루프승인", "#태스크처리"],
    loop_remediate: ["#루프실행"],
    loop_approve: ["#루프실행"],
    loop_delete: ["#루프분석", "#태스크처리"],
    loop_restore: ["#루프실행", "#루프보완"],
    loop_rollback: ["#루프보완", "#태스크처리"]
  } as const;

  for (const [tag, expected] of Object.entries(matrix)) {
    assert.deepEqual(getHarnessNextPromptConstraint(tag as keyof typeof matrix, "executed").allowedTags, expected);
  }
});

test("Loop completion protocol validates command-specific prompt fields", () => {
  const result = buildHarnessCompletionProtocol({
    tag: "loop_approve",
    outcome: "executed",
    nextPrompt: ["#루프실행{", "loopId: codex_loop_025_001", "}"].join("\n")
  });
  const invalid = buildHarnessCompletionProtocol({
    tag: "loop_rollback",
    outcome: "ready",
    nextPrompt: ["#루프롤백{", "loopId: codex_loop_025_001", "}"].join("\n")
  });

  assert.equal(result.status, "pass");
  assert.equal(result.nextTag, "#루프실행");
  assert.equal(invalid.status, "blocked");
  assert.match(invalid.violations.join("; "), /롤백승인경로/);
});

test("session close execution requires a dynamic structured session-start prompt", () => {
  const result = buildHarnessCompletionProtocol({
    tag: "session_close",
    outcome: "executed",
    nextPrompt: [
      "#세션시작{",
      "세션번호: 026",
      "세션명: 026_HCP_후속작업",
      "에이전트: codex",
      "이전 세션: codex_ses_025_001 = complete",
      "다음 작업: 후속 후보를 확인한다",
      "}"
    ].join("\n")
  });

  assert.equal(result.status, "pass");
  assert.equal(result.nextTag, "#세션시작");
  assert.doesNotMatch(result.nextPrompt, /^#세션시작$/);
});
