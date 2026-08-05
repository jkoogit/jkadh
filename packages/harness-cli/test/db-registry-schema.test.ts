import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const baselineSql = readFileSync(join(repoRoot, "packages/harness-cli/baseline/003_create_hcp_registry.sql"), "utf8");
const migrationSql = readFileSync(join(repoRoot, "packages/harness-cli/migrations/011_create_hcp_registry_tables.sql"), "utf8");

test("PLAN-REGISTRY tables and additive legacy columns exist in baseline and migration", () => {
  for (const sql of [baselineSql, migrationSql]) {
    assert.match(sql, /create table if not exists hcp\.harness_repository \(/);
    assert.match(sql, /create table if not exists hcp\.harness_work_group \(/);
    assert.match(sql, /create table if not exists hcp\.harness_issue_role \(/);
    assert.match(sql, /create table if not exists hcp\.harness_work_group_counter \(/);
    assert.match(sql, /create table if not exists hcp\.harness_task_counter \(/);
    assert.match(sql, /create table if not exists hcp\.harness_id_allocation \(/);
    assert.match(sql, /add column if not exists repository_id bigint/);
    assert.match(sql, /add column if not exists work_group_id text/);
    assert.match(sql, /add column if not exists execution_issue_id text/);
    assert.match(sql, /add column if not exists issue_policy text/);
    assert.match(sql, /constraint harness_issue_role_value check \(issue_role in \('registration', 'execution', 'related', 'handoff'\)\)/);
    assert.match(sql, /constraint harness_work_group_issue_policy check \(issue_policy in \('dedicated', 'shared_registration'\)\)/);
    assert.match(sql, /constraint harness_issue_role_owner_role check \(/);
    assert.match(sql, /harness_issue_role_registration_owner_uidx[\s\S]*where owner_type = 'work_group' and issue_role = 'registration'/);
    assert.match(sql, /harness_issue_role_execution_owner_uidx[\s\S]*where owner_type = 'task' and issue_role = 'execution'/);
    assert.doesNotMatch(sql.toLowerCase(), /\bforeign\s+key\b/);
  }
});

test("repository key immutability and composite remote coordinates are DB-enforced", () => {
  for (const sql of [baselineSql, migrationSql]) {
    assert.match(sql, /repository_key text not null unique/);
    assert.match(sql, /unique \(provider, repository_full_name\)/);
    assert.match(sql, /constraint harness_repository_full_name_lowercase check \(repository_full_name = lower\(repository_full_name\)\)/);
    assert.match(sql, /constraint harness_repository_canonical_url check \(canonical_url = 'https:\/\/github\.com\/' \|\| repository_full_name\)/);
    assert.match(sql, /create or replace function hcp\.prevent_repository_key_change\(\)/);
    assert.match(sql, /create trigger harness_repository_key_immutable/);
    assert.match(sql, /harness_issue_repository_provider_number_uidx[\s\S]*repository_id, provider, issue_number/);
  }
});

test("WG and Task counters use one atomic non-reusing increment statement", () => {
  for (const sql of [baselineSql, migrationSql]) {
    assert.match(sql, /primary key \(repository_id, registration_issue_number\)/);
    assert.match(sql, /primary key \(repository_id, execution_issue_number\)/);
    assert.match(sql, /constraint harness_work_group_counter_sequence check \(last_sequence >= 0\)/);
    assert.match(sql, /constraint harness_work_group_counter_issue_policy check \(issue_policy in \('dedicated', 'shared_registration'\)\)/);
    assert.match(sql, /constraint harness_task_counter_sequence check \(last_sequence >= 0\)/);
    assert.match(sql, /constraint harness_task_counter_issue_policy check \(issue_policy in \('dedicated', 'shared_umbrella'\)\)/);
    assert.match(sql, /allocation_key text not null unique/);
    assert.match(sql, /harness_task_allocation_key_uidx/);
    assert.match(sql, /harness_work_group_dedicated_issue_uidx[\s\S]*where issue_policy = 'dedicated'/);
    assert.match(sql, /harness_task_dedicated_issue_uidx[\s\S]*where issue_policy = 'dedicated'/);
    assert.match(sql, /harness_id_allocation_status check \(status in \('reserved', 'allocated', 'tombstoned'\)\)/);
    assert.match(sql, /create trigger harness_work_group_identity_immutable/);
    assert.match(sql, /create trigger harness_work_group_delete_blocked/);
    assert.match(sql, /create or replace function hcp\.prevent_work_group_identity_change\(\)/);
    assert.match(sql, /create or replace function hcp\.prevent_work_group_delete\(\)/);
    assert.doesNotMatch(sql, /prevent_registry_(identity_change|allocation_delete)/);
    assert.match(sql, /create trigger harness_repository_delete_blocked/);
    assert.match(sql, /create trigger harness_task_registry_identity_immutable/);
    assert.match(sql, /create trigger harness_task_registry_delete_blocked/);
    assert.match(sql, /create trigger harness_id_allocation_identity_immutable/);
    assert.match(sql, /create trigger harness_id_allocation_delete_blocked/);
  }
});

test("all PLAN-REGISTRY tables and additive columns have Korean comments", () => {
  const tableColumns: Record<string, string[]> = {
    harness_repository: [
      "repository_id", "repository_key", "provider", "repository_full_name", "canonical_url",
      "lifecycle_policy", "status", "created_at", "updated_at"
    ],
    harness_work_group: [
      "work_group_id", "repository_id", "registration_issue_id", "issue_sequence", "allocation_key",
      "title", "issue_policy", "status", "created_at", "updated_at"
    ],
    harness_issue_role: ["issue_role_id", "issue_id", "owner_type", "owner_id", "issue_role", "created_at"],
    harness_work_group_counter: [
      "repository_id", "registration_issue_number", "issue_policy", "last_sequence", "updated_at"
    ],
    harness_task_counter: [
      "repository_id", "execution_issue_number", "issue_policy", "last_sequence", "updated_at"
    ],
    harness_id_allocation: [
      "allocation_id", "allocation_key", "request_fingerprint", "entity_type", "repository_id", "issue_id",
      "issue_number", "issue_sequence", "entity_id", "status", "failure_reason", "created_at", "updated_at", "finalized_at"
    ]
  };
  const additiveColumns: Record<string, string[]> = {
    harness_issue: ["repository_id"],
    harness_task: ["repository_id", "work_group_id", "execution_issue_id", "issue_sequence", "allocation_key", "issue_policy"]
  };
  for (const sql of [baselineSql, migrationSql]) {
    for (const [table, columns] of Object.entries({ ...tableColumns, ...additiveColumns })) {
      for (const column of columns) {
        assert.match(sql, new RegExp(`comment on column hcp\\.${table}\\.${column} is '[^']*[가-힣][^']*';`));
      }
    }
  }
});
