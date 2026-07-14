import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const baselineSql = readFileSync(join(repoRoot, "packages/harness-cli/baseline/001_init_schema.sql"), "utf8");
const migrationSql = readFileSync(join(repoRoot, "packages/harness-cli/migrations/007_create_hcp_session_tables.sql"), "utf8");

test("hcp session tables are present in baseline and migration", () => {
  for (const sql of [baselineSql, migrationSql]) {
    assert.match(sql, /create schema if not exists hcp;/);
    assert.match(sql, /create table if not exists hcp\.harness_session \(/);
    assert.match(sql, /create table if not exists hcp\.harness_session_event \(/);
    assert.match(sql, /comment on table hcp\.harness_session is 'Codex Harness 세션의 식별자/);
    assert.match(sql, /comment on column hcp\.harness_session_event\.session_id is '이벤트가 속한 Harness 세션 ID/);
  }
});

test("hcp session schema keeps logical links without physical foreign keys", () => {
  assert.doesNotMatch(migrationSql.toLowerCase(), /\bforeign\s+key\b/);
  assert.doesNotMatch(migrationSql.toLowerCase(), /\breferences\b/);
});
