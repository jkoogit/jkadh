import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import type { DbClient, DbQueryResult } from "../src/db/db-client.ts";
import type { DbConfig } from "../src/db/db-config.ts";
import {
  acquireRegistryTestRunLock,
  cleanupRegistryTestDatabase,
  markRegistryTestDatabaseCreated,
  readRegistryTestRecoveryManifest,
  recoverPendingRegistryTestDatabase,
  releaseRegistryTestRunLock,
  reserveRegistryTestDatabase,
  resolveRegistryTestRecoveryFile
} from "../src/db/registry-test-recovery.ts";

const config: DbConfig = {
  env: "ci",
  host: "127.0.0.1",
  port: 5432,
  database: "jkadh_registry_admin",
  user: "postgres",
  password: "not-recorded"
};
const databaseName = "jkadh_registry_it_0123456789abcdef0123456789abcdef";

class RecoveryClient implements DbClient {
  readonly queries: Array<{ sql: string; values?: unknown[] }> = [];
  async query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<DbQueryResult<Row>> {
    this.queries.push({ sql, values });
    return { rows: [] };
  }
  async end(): Promise<void> {}
}

class FailingCleanupClient extends RecoveryClient {
  override async query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<DbQueryResult<Row>> {
    if (/drop database/i.test(sql)) throw new Error("cleanup connection lost");
    return super.query<Row>(sql, values);
  }
}

test("registry test recovery manifest survives creation and is removed only after cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-recovery-"));
  const recoveryFile = join(root, "recovery.json");
  reserveRegistryTestDatabase(recoveryFile, config, databaseName, new Date("2026-08-01T00:00:00.000Z"));
  markRegistryTestDatabaseCreated(recoveryFile, config, databaseName, new Date("2026-08-01T00:00:01.000Z"));
  assert.equal(readRegistryTestRecoveryManifest(recoveryFile)?.status, "created");

  const client = new RecoveryClient();
  await cleanupRegistryTestDatabase(client, config, recoveryFile, databaseName);
  assert.equal(existsSync(recoveryFile), false);
  assert.equal(client.queries.length, 2);
  assert.match(client.queries[1].sql, new RegExp(`drop database if exists ${databaseName}`));
});

test("pending registry test database is recovered before a new test starts", async () => {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-recovery-"));
  const recoveryFile = join(root, "recovery.json");
  reserveRegistryTestDatabase(recoveryFile, config, databaseName);
  const client = new RecoveryClient();

  const recovered = await recoverPendingRegistryTestDatabase(client, config, recoveryFile);

  assert.equal(recovered, databaseName);
  assert.equal(existsSync(recoveryFile), false);
  assert.equal(client.queries.length, 2);
});

test("recovery refuses a different PostgreSQL coordinate and preserves the manifest", async () => {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-recovery-"));
  const recoveryFile = join(root, "recovery.json");
  reserveRegistryTestDatabase(recoveryFile, config, databaseName);
  const client = new RecoveryClient();

  await assert.rejects(() => recoverPendingRegistryTestDatabase(client, {
    ...config,
    host: "different-host"
  }, recoveryFile), /cleanup_required.*different configured PostgreSQL coordinate/);
  assert.equal(existsSync(recoveryFile), true);
  assert.equal(client.queries.length, 0);
});

test("malformed recovery manifest fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-recovery-"));
  const recoveryFile = join(root, "recovery.json");
  writeFileSync(recoveryFile, "not-json", "utf8");
  assert.throws(() => readRegistryTestRecoveryManifest(recoveryFile), /cleanup_required.*malformed/);
});

test("cleanup failure preserves the recovery manifest for the next run", async () => {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-recovery-"));
  const recoveryFile = join(root, "recovery.json");
  reserveRegistryTestDatabase(recoveryFile, config, databaseName);

  await assert.rejects(
    () => cleanupRegistryTestDatabase(new FailingCleanupClient(), config, recoveryFile, databaseName),
    /cleanup connection lost/
  );
  assert.equal(existsSync(recoveryFile), true);
  assert.equal(readRegistryTestRecoveryManifest(recoveryFile)?.testDatabase, databaseName);
});

test("registry PostgreSQL run lock permits one owner and never removes an existing lock by age", () => {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-recovery-"));
  const recoveryFile = join(root, "recovery.json");
  const lock = acquireRegistryTestRunLock(recoveryFile, new Date("2020-01-01T00:00:00.000Z"));

  assert.throws(
    () => acquireRegistryTestRunLock(recoveryFile, new Date("2026-08-05T00:00:00.000Z")),
    /verification_run_locked.*inspect its owner/
  );
  assert.equal(existsSync(lock.path), true);

  releaseRegistryTestRunLock(lock);
  assert.equal(existsSync(lock.path), false);
});

test("registry test recovery manifest path cannot target source files", () => {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-recovery-"));
  assert.throws(
    () => resolveRegistryTestRecoveryFile(root, {
      JKADH_REGISTRY_TEST_RECOVERY_FILE: "packages/harness-cli/src/recovery.json"
    }),
    /must be a file under.*\.hcp.*verification/
  );
});
