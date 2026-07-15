import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const baselineSql = readFileSync(join(repoRoot, "packages/harness-cli/baseline/001_init_schema.sql"), "utf8");
const migrationSql = readFileSync(join(repoRoot, "packages/harness-cli/migrations/008_create_hcp_task_tables.sql"), "utf8");

test("hcp task tables are present in baseline and migration", () => {
  for (const sql of [baselineSql, migrationSql]) {
    assert.match(sql, /create table if not exists hcp\.harness_task \(/);
    assert.match(sql, /create table if not exists hcp\.harness_task_event \(/);
    assert.match(sql, /constraint harness_task_status check \(status in \('active', 'closed', 'promoted', 'blocked', 'failed', 'deleted'\)\)/);
    assert.match(sql, /comment on table hcp\.harness_task is 'Harness 태스크의 생명주기 상태/);
    assert.match(sql, /comment on column hcp\.harness_task\.session_id is '태스크가 속한 Harness 세션 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
    assert.match(sql, /comment on column hcp\.harness_task_event\.task_id is '이벤트가 속한 Harness 태스크 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
  }
});

test("hcp task schema keeps logical links without physical foreign keys", () => {
  assert.doesNotMatch(migrationSql.toLowerCase(), /\bforeign\s+key\b/);
  assert.doesNotMatch(migrationSql.toLowerCase(), /\breferences\b/);
  assert.match(migrationSql, /create index if not exists harness_task_session_idx on hcp\.harness_task\(session_id\);/);
  assert.match(migrationSql, /create index if not exists harness_task_event_task_idx on hcp\.harness_task_event\(task_id\);/);
});
