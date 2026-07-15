import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const baselineSql = readFileSync(join(repoRoot, "packages/harness-cli/baseline/001_init_schema.sql"), "utf8");
const migrationSql = readFileSync(join(repoRoot, "packages/harness-cli/migrations/010_create_hcp_issue_branch_tables.sql"), "utf8");

test("hcp issue and branch tables are present in baseline and migration", () => {
  for (const sql of [baselineSql, migrationSql]) {
    assert.match(sql, /create table if not exists hcp\.harness_issue \(/);
    assert.match(sql, /create table if not exists hcp\.harness_branch \(/);
    assert.match(sql, /constraint harness_issue_provider check \(provider in \('github'\)\)/);
    assert.match(sql, /constraint harness_issue_status check \(status in \('open', 'closed'\)\)/);
    assert.match(sql, /constraint harness_branch_role check \(branch_role in \('work', 'base', 'promote_target'\)\)/);
    assert.match(sql, /constraint harness_branch_status check \(status in \('active', 'merged', 'promoted', 'deleted'\)\)/);
    assert.match(sql, /comment on table hcp\.harness_issue is 'Harness 세션과 태스크에 연결된 GitHub Issue snapshot 정보/);
    assert.match(sql, /comment on table hcp\.harness_branch is 'Harness 작업 브랜치와 기준 브랜치, 승급 대상 브랜치 추적 정보/);
    assert.match(sql, /comment on column hcp\.harness_issue\.session_id is 'Issue가 연결된 Harness 세션 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
    assert.match(sql, /comment on column hcp\.harness_issue\.task_id is 'Issue가 연결된 Harness 태스크 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
    assert.match(sql, /comment on column hcp\.harness_branch\.session_id is '브랜치가 연결된 Harness 세션 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
    assert.match(sql, /comment on column hcp\.harness_branch\.task_id is '브랜치가 연결된 Harness 태스크 ID\. 물리 제약 없이 논리 연결로 관리한다'/);
  }
});

test("hcp issue and branch schema keeps logical links without physical foreign keys", () => {
  assert.doesNotMatch(migrationSql.toLowerCase(), /\bforeign\s+key\b/);
  assert.doesNotMatch(migrationSql.toLowerCase(), /\breferences\b/);
  assert.match(migrationSql, /create index if not exists harness_issue_session_idx on hcp\.harness_issue\(session_id\);/);
  assert.match(migrationSql, /create index if not exists harness_issue_task_idx on hcp\.harness_issue\(task_id\);/);
  assert.match(migrationSql, /create index if not exists harness_branch_session_idx on hcp\.harness_branch\(session_id\);/);
  assert.match(migrationSql, /create index if not exists harness_branch_task_idx on hcp\.harness_branch\(task_id\);/);
});
