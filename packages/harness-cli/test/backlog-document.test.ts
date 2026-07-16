import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { createBacklogDocument } from "../src/docs/backlog-document.ts";
import { hasBacklogIndexEntry, parseBacklogIndex } from "../src/docs/backlog-index.ts";

test("backlog document creation writes document and updates unresolved index", () => {
  const repo = mkdtempSync(join(tmpdir(), "backlog-doc-"));
  const backlogRoot = join(repo, "docs", "15.로그", "backlog");
  mkdirSync(backlogRoot, { recursive: true });
  const indexPath = join(backlogRoot, "README.md");
  const indexMarkdown = [
    "# Backlog 미해결 인덱스",
    "",
    "## 미해결 백로그",
    "",
    "| ID | 제목 | 상태 | 처리시점 | 우선순위 | 의존 대상 | 연결 Issue | 경로 |",
    "|---|---|---|---|---|---|---|---|",
    "| BLG-028 | 기존 항목 | Ready | 다음 Issue 선정 시 | Medium | - | - | [BLG-028](./2026/07/16/BLG-028_기존_항목.md) |",
    ""
  ].join("\n");
  writeIndex(indexPath, indexMarkdown);

  const result = createBacklogDocument(repo, {
    title: "Backlog 경량 처리 테스트",
    status: "Ready",
    type: "HCP",
    date: "2026-07-16",
    content: "문서 Backlog를 생성한다."
  });

  assert.equal(result.backlogId, "BLG-029");
  assert.equal(result.gate.status, "pass");
  assert.equal(existsSync(join(repo, result.filePath)), true);

  const updatedIndex = readFileSync(indexPath, "utf8");
  assert.equal(hasBacklogIndexEntry(updatedIndex, {
    backlogId: "BLG-029",
    path: result.indexRef
  }), true);

  const entries = parseBacklogIndex(updatedIndex);
  assert.equal(entries.at(-1)?.id, "BLG-029");
  assert.equal(entries.at(-1)?.title, "Backlog 경량 처리 테스트");
});

function writeIndex(path: string, markdown: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown, "utf8");
}
