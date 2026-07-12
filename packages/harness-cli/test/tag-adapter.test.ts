import assert from "node:assert/strict";
import { test } from "node:test";

import { parseHarnessTag } from "../src/tags/tag-adapter.ts";

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

test("tag adapter rejects unsupported tags", () => {
  assert.equal(parseHarnessTag("#알수없음"), undefined);
});
