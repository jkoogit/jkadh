import assert from "node:assert/strict";
import { test } from "node:test";

import { parseHarnessTag, parseHarnessTagCommand } from "../src/tags/tag-adapter.ts";

test("tag adapter maps Korean session and task tags to flow ids", () => {
  assert.equal(parseHarnessTag("#세션시작"), "session_start");
  assert.equal(parseHarnessTag("#태스크시작"), "task_start");
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

test("tag adapter rejects unsupported tags", () => {
  assert.equal(parseHarnessTag("#알수없음"), undefined);
  assert.equal(parseHarnessTagCommand("#알수없음.보고"), undefined);
});
