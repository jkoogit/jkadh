import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHarnessTagExecutionOrder,
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
  assert.deepEqual(order.steps, ["check_active_session", "check_active_task", "check_registered_branch", "check_task_scope"]);
});

test("tag adapter expands standalone task close into dev merge approval order", () => {
  const parsed = parseHarnessTagCommand("#태스크정리");
  assert.ok(parsed);

  const order = buildHarnessTagExecutionOrder(parsed);

  assert.equal(order.intent, "task_close_execute");
  assert.deepEqual(order.steps, ["commit_changes", "push_branch", "create_pr", "merge_pr_to_dev"]);
  assert.equal(order.sharedBranchWrite, "dev");
  assert.match(order.approvalEquivalence ?? "", /PR 생성과 dev merge 포함 승인/);
  assert.match(order.approvalJustification ?? "", /dev merge를 포함/);
});

test("tag adapter formats task close approval order before execution", () => {
  const parsed = parseHarnessTagCommand("#태스크정리");
  assert.ok(parsed);

  const markdown = formatHarnessTagExecutionOrder(buildHarnessTagExecutionOrder(parsed));

  assert.match(markdown, /# HCP normalized execution order/);
  assert.match(markdown, /steps: commit_changes -> push_branch -> create_pr -> merge_pr_to_dev/);
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
  assert.deepEqual(order.steps, ["commit_changes", "push_branch", "create_pr", "merge_pr_to_dev"]);
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

test("tag adapter treats session close PR reuse suffix as explicit reuse approval", () => {
  const parsed = parseHarnessTagCommand("#세션정리.PR재사용");
  assert.deepEqual(parsed, {
    tag: "session_close",
    mode: "reuse"
  });

  const order = buildHarnessTagExecutionOrder(parsed);

  assert.equal(order.intent, "session_close_reuse_open_pr_execute");
  assert.deepEqual(order.steps, ["write_retrospective", "update_issue", "commit_changes", "push_branch", "reuse_open_pr", "merge_pr", "promote_branch", "close_issue"]);
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
