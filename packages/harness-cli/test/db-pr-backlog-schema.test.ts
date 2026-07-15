import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const baselineSql = readFileSync(join(repoRoot, "packages/harness-cli/baseline/001_init_schema.sql"), "utf8");
const migrationSql = readFileSync(join(repoRoot, "packages/harness-cli/migrations/009_create_hcp_pr_backlog_tables.sql"), "utf8");

test("hcp pull request and backlog tables are present in baseline and migration", () => {
  for (const sql of [baselineSql, migrationSql]) {
    assert.match(sql, /create table if not exists hcp\.harness_pull_request \(/);
    assert.match(sql, /create table if not exists hcp\.harness_backlog_item \(/);
    assert.match(sql, /constraint harness_pull_request_status check \(status in \('draft', 'open', 'merged', 'closed'\)\)/);
    assert.match(sql, /constraint harness_backlog_item_status check \(status in \('open', 'closed', 'deferred'\)\)/);
    assert.match(sql, /comment on table hcp\.harness_pull_request is 'Harness 태스크와 연결된 GitHub PR 추적 정보/);
    assert.match(sql, /comment on table hcp\.harness_backlog_item is 'Harness 세션 중 등록된 runtime Backlog 항목/);
    assert.match(sql, /comment on column hcp\.harness_pull_request\.task_id is 'PR이 속한 Harness 태스크 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
    assert.match(sql, /comment on column hcp\.harness_backlog_item\.session_id is 'Backlog 항목이 속한 Harness 세션 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
  }
});

test("hcp pull request and backlog schema keeps logical links without physical foreign keys", () => {
  assert.doesNotMatch(migrationSql.toLowerCase(), /\bforeign\s+key\b/);
  assert.doesNotMatch(migrationSql.toLowerCase(), /\breferences\b/);
  assert.match(migrationSql, /create index if not exists harness_pull_request_task_idx on hcp\.harness_pull_request\(task_id\);/);
  assert.match(migrationSql, /create index if not exists harness_backlog_item_session_idx on hcp\.harness_backlog_item\(session_id\);/);
});
