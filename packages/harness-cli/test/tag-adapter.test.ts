import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHarnessTagExecutionOrder,
  expandHarnessTagBlockArgs,
  formatHarnessTagExecutionOrder,
  parseHarnessTag,
  parseHarnessTagCommand
} from "../src/tags/tag-adapter.ts";

test("tag adapter maps Korean session and task tags to flow ids", () => {
  assert.equal(parseHarnessTag("#세션시작"), "session_start");
  assert.equal(parseHarnessTag("#태스크시작"), "task_start");
  assert.equal(parseHarnessTag("#태스크처리"), "task_process");
  assert.equal(parseHarnessTag("#태스크정리"), "task_close");
  assert.equal(parseHarnessTag("#태스크승급"), "task_promote");
  assert.equal(parseHarnessTag("#세션정리"), "session_close");
});

test("tag adapter ignores surrounding text and whitespace", () => {
  assert.equal(parseHarnessTag("  #세션시작\n원격 브랜치 확인"), "session_start");
});

test("tag adapter marks default tags as execute mode", () => {
  assert.deepEqual(parseHarnessTagCommand("#태스크정리"), {
    tag: "task_close",
    mode: "execute"
  });
});

test("tag adapter defines task process prerequisite checks", () => {
  const parsed = parseHarnessTagCommand("#태스크처리");
  assert.ok(parsed);
  const order = buildHarnessTagExecutionOrder(parsed);

  assert.equal(order.intent, "task_process_execute");
  assert.deepEqual(order.steps, [
    "check_active_session", "check_active_task", "check_registered_branch", "check_task_scope",
    "confirm_missing_handling", "validate_next_prompt_constraints", "suggest_copy_ready_next_prompt"
  ]);
});

test("tag adapter expands standalone task close into dev merge approval order", () => {
  const parsed = parseHarnessTagCommand("#태스크정리");
  assert.ok(parsed);

  const order = buildHarnessTagExecutionOrder(parsed);

  assert.equal(order.intent, "task_close_execute");
  assert.deepEqual(order.steps, [
    "commit_changes", "push_branch", "create_pr", "merge_pr_to_dev",
    "confirm_missing_handling", "validate_next_prompt_constraints", "suggest_copy_ready_next_prompt"
  ]);
  assert.equal(order.sharedBranchWrite, "dev");
  assert.match(order.approvalEquivalence ?? "", /PR 생성과 dev merge 포함 승인/);
  assert.match(order.approvalJustification ?? "", /dev merge를 포함/);
});

test("tag adapter formats task close approval order before execution", () => {
  const parsed = parseHarnessTagCommand("#태스크정리");
  assert.ok(parsed);

  const markdown = formatHarnessTagExecutionOrder(buildHarnessTagExecutionOrder(parsed));

  assert.match(markdown, /# HCP normalized execution order/);
  assert.match(markdown, /steps: commit_changes -> push_branch -> create_pr -> merge_pr_to_dev -> confirm_missing_handling -> validate_next_prompt_constraints -> suggest_copy_ready_next_prompt/);
  assert.match(markdown, /shared branch write: dev/);
  assert.match(markdown, /approval justification: .*dev merge/);
});

test("tag adapter treats task close PR merge suffix as explicit merge approval", () => {
  const parsed = parseHarnessTagCommand("#태스크정리.PR머지");
  assert.deepEqual(parsed, {
    tag: "task_close",
    mode: "merge"
  });

  const order = buildHarnessTagExecutionOrder(parsed);

  assert.equal(order.intent, "task_close_execute");
  assert.deepEqual(order.steps, [
    "commit_changes", "push_branch", "create_pr", "merge_pr_to_dev",
    "confirm_missing_handling", "validate_next_prompt_constraints", "suggest_copy_ready_next_prompt"
  ]);
  assert.match(order.approvalEquivalence ?? "", /명시 승인/);
  assert.match(order.approvalJustification ?? "", /#태스크정리\.PR머지로 dev merge를 명시 승인/);
});

test("tag adapter formats explicit PR merge approval order", () => {
  const parsed = parseHarnessTagCommand("#태스크정리.PR머지");
  assert.ok(parsed);

  const markdown = formatHarnessTagExecutionOrder(buildHarnessTagExecutionOrder(parsed));

  assert.match(markdown, /mode: merge/);
  assert.match(markdown, /shared branch write: dev/);
  assert.match(markdown, /approval justification: .*명시 승인/);
});

test("tag adapter marks dot report suffix as report mode", () => {
  assert.deepEqual(parseHarnessTagCommand("#태스크정리.보고"), {
    tag: "task_close",
    mode: "report"
  });
  assert.equal(parseHarnessTag("#태스크정리.보고"), "task_close");
});

test("tag adapter rejects unsupported task start suffixes", () => {
  assert.equal(parseHarnessTagCommand("#태스크시작.번외"), undefined);
  assert.equal(parseHarnessTagCommand("#태스크시작.번외.보고"), undefined);
  assert.equal(parseHarnessTag("번외 #태스크시작"), undefined);
});

test("tag adapter accepts inline block tags", () => {
  assert.deepEqual(parseHarnessTagCommand(`#세션시작{
세션번호: 010
세션명: 010_HCP
}`), {
    tag: "session_start",
    mode: "execute"
  });
});

test("tag adapter converts copy-ready lifecycle blocks into executable CLI options", () => {
  assert.deepEqual(expandHarnessTagBlockArgs("session_start", [`#세션시작{
세션번호: 026
세션명: 026_HCP_후속작업
에이전트: codex
}`]), ["--session-number", "026", "--session-name", "026_HCP_후속작업", "--agent-id", "codex"]);

  assert.deepEqual(expandHarnessTagBlockArgs("task_start", [`#태스크시작{
sessionId: codex_ses_025_001
작업지시: SESSION-025-TASK-002
작업범위: 후속 작업
제외범위: 없음
완료조건: 완료
검증방법: npm test
}`]), [
    "--session-id", "codex_ses_025_001", "--work-order", "SESSION-025-TASK-002", "--scope", "후속 작업",
    "--out-of-scope", "없음", "--completion", "완료", "--verification", "npm test"
  ]);

  assert.deepEqual(expandHarnessTagBlockArgs("task_process", [`#태스크처리{
sessionId: codex_ses_025_001
taskId: codex_task_025_001
작업내용: 구현한다
}`]), ["--session-id", "codex_ses_025_001", "--task-id", "codex_task_025_001", "--scope", "구현한다"]);

  assert.deepEqual(expandHarnessTagBlockArgs("task_close", [`#태스크정리{
sessionId: codex_ses_025_001
taskId: codex_task_025_001
완료내용: 구현 완료
검증결과: 통과
제외범위: 없음
남은작업: 없음
변경경로: packages/harness-cli/src,packages/harness-cli/test
커밋메시지: feat: apply completion protocol
PR제목: [172]_(001)_completion_protocol
관련이슈: 172
}`]), [
    "--session-id", "codex_ses_025_001", "--task-id", "codex_task_025_001", "--completion", "구현 완료",
    "--verification", "통과", "--out-of-scope", "없음", "--remaining", "없음",
    "--paths", "packages/harness-cli/src,packages/harness-cli/test", "--message", "feat: apply completion protocol",
    "--pr-title", "[172]_(001)_completion_protocol", "--related-issue", "172"
  ]);

  assert.deepEqual(expandHarnessTagBlockArgs("task_promote", [`#태스크승급{
sessionId: codex_ses_025_001
taskId: codex_task_025_001
대상커밋: abc123
대상브랜치: stg,main
검증결과: 통과
}`]), [
    "--session-id", "codex_ses_025_001", "--task-id", "codex_task_025_001", "--target-commit", "abc123",
    "--target-branches", "stg,main", "--verification", "통과"
  ]);

  assert.deepEqual(expandHarnessTagBlockArgs("session_close", [`#세션정리{
sessionId: codex_ses_025_001
완료태스크: codex_task_025_001
세션명: 025_HCP_completion_protocol
이슈현행화: 최종 결과 반영
남은작업: 없음
회고: 회고 생성
다음세션인계: 다음 작업 확인
커밋메시지: docs: close session 025
PR제목: [025]_(001)_session_close
관련이슈: 172
이슈제목: [172]_[HCP]_completion_protocol
}`]), [
    "--session-id", "codex_ses_025_001", "--completed-tasks", "codex_task_025_001",
    "--session-name", "025_HCP_completion_protocol", "--issue-update", "최종 결과 반영", "--remaining", "없음",
    "--retrospective", "회고 생성", "--handoff", "다음 작업 확인", "--message", "docs: close session 025",
    "--pr-title", "[025]_(001)_session_close", "--related-issue", "172", "--issue-title", "[172]_[HCP]_completion_protocol"
  ]);
});

test("tag adapter treats session close PR reuse suffix as explicit reuse approval", () => {
  const parsed = parseHarnessTagCommand("#세션정리.PR재사용");
  assert.deepEqual(parsed, {
    tag: "session_close",
    mode: "reuse"
  });

  const order = buildHarnessTagExecutionOrder(parsed);

  assert.equal(order.intent, "session_close_reuse_open_pr_execute");
  assert.deepEqual(order.steps, [
    "write_retrospective", "update_issue", "commit_changes", "push_branch", "reuse_open_pr", "merge_pr", "promote_branch", "close_issue",
    "confirm_missing_handling", "validate_next_prompt_constraints", "suggest_copy_ready_next_prompt"
  ]);
  assert.match(order.approvalJustification ?? "", /열린 세션정리 PR 재사용을 명시 승인/);
});

test("tag adapter rejects PR suffixes on unsupported flows", () => {
  assert.equal(parseHarnessTagCommand("#세션정리.PR머지"), undefined);
  assert.equal(parseHarnessTagCommand("#태스크정리.PR재사용"), undefined);
});

test("tag adapter rejects unsupported tags", () => {
  assert.equal(parseHarnessTag("#알수없음"), undefined);
  assert.equal(parseHarnessTagCommand("#알수없음.보고"), undefined);
});
