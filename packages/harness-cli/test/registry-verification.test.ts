import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  runRegistryVerification,
  type RegistryVerificationDependencies,
  type VerificationCommand,
  type VerificationCommandResult
} from "../src/db/registry-verification.ts";
import { validateRegistryVerificationConfig } from "../src/db/registry-verification-policy.ts";

const testDatabase = `jkadh_registry_it_${"a".repeat(32)}`;

test("single DB-first verification runs DB check before unit, static, and actual PostgreSQL integration", () => {
  const root = fixtureRepo();
  const calls: VerificationCommand[] = [];
  const result = runRegistryVerification(root, { evidenceFile: ".hcp/verification/evidence.json" }, dependencies([
    dbPassed(),
    passed(),
    passed(),
    passed([
      "# postgresql-version: 17.10",
      `# temporary-database-created: ${testDatabase}`,
      `# temporary-database-cleanup: ${testDatabase}`
    ].join("\n")),
    dbPassed()
  ], calls));

  assert.equal(result.status, "verified");
  assert.equal(result.evidence.schemaVersion, 3);
  assert.equal(result.evidence.lastCompletedStep, "complete");
  assert.equal(result.evidence.cleanupStatus, "completed");
  assert.deepEqual(calls.map((command) => command.step), [
    "db_check_before", "unit_tests", "static_check", "postgresql_integration", "db_check_after"
  ]);
  assert.equal(calls[3].env?.JKADH_RUN_DB_INTEGRATION, "true");
  assert.equal(result.evidence.migrationVersionBefore, "7");
  assert.equal(result.evidence.migrationVersionAfter, "7");
  assert.equal(result.evidence.steps.length, 5);
  assert.equal(JSON.parse(readFileSync(join(root, ".hcp/verification/evidence.json"), "utf8")).status, "verified");
});

test("DB connection failure pauses before unit and static verification", () => {
  const root = fixtureRepo();
  const calls: VerificationCommand[] = [];
  const result = runRegistryVerification(root, {}, dependencies([
    failed("connect ETIMEDOUT 192.168.219.125:35432")
  ], calls));

  assert.equal(result.status, "paused");
  assert.equal(result.evidence.lastCompletedStep, "not_started");
  assert.equal(result.evidence.operationResult, "not_started");
  assert.match(result.evidence.detail, /no unit, static, PostgreSQL integration/);
  assert.deepEqual(calls.map((command) => command.step), ["db_check_before"]);
});

test("DB loss after isolated database reservation requires result and cleanup recovery", () => {
  const root = fixtureRepo();
  const recoveryFile = join(root, ".hcp/verification/PLAN-REGISTRY-postgresql-recovery.json");
  const calls: VerificationCommand[] = [];
  const results = [dbPassed(), passed(), passed()];
  const result = runRegistryVerification(root, {}, {
    ...dependencies(results, calls),
    runCommand(command) {
      calls.push(command);
      if (command.step !== "postgresql_integration") return results.shift() ?? passed();
      mkdirSync(join(root, ".hcp/verification"), { recursive: true });
      writeFileSync(recoveryFile, `${JSON.stringify({
        schemaVersion: 1,
        status: "created",
        testDatabase,
        serverFingerprint: "b".repeat(64),
        createdAt: "2026-08-05T00:00:00.000Z",
        updatedAt: "2026-08-05T00:00:00.000Z"
      })}\n`);
      return failed("connection terminated unexpectedly");
    }
  });

  assert.equal(result.status, "recovery_required");
  assert.equal(result.evidence.operationResult, "unknown");
  assert.equal(result.evidence.cleanupStatus, "required");
  assert.equal(result.evidence.temporaryDatabase, testDatabase);
});

test("ordinary unit failure blocks instead of being misclassified as a DB pause", () => {
  const root = fixtureRepo();
  const result = runRegistryVerification(root, {}, dependencies([
    dbPassed(),
    failed("AssertionError: registry invariant failed")
  ]));

  assert.equal(result.status, "blocked");
  assert.equal(result.evidence.lastCompletedStep, "db_check_before");
  assert.match(result.evidence.detail, /registry invariant failed/);
});

test("concurrent PostgreSQL verification run lock requires recovery without another DB run", () => {
  const result = runRegistryVerification(fixtureRepo(), {}, dependencies([
    dbPassed(), passed(), passed(),
    failed("verification_run_locked: recovery.json.run.lock already exists")
  ]));

  assert.equal(result.status, "recovery_required");
  assert.equal(result.evidence.operationResult, "unknown");
  assert.equal(result.evidence.cleanupStatus, "required");
  assert.match(result.evidence.detail, /another PostgreSQL verification owns/);
});

test("DDL parity is checked only after a healthy DB preflight", () => {
  const root = fixtureRepo("baseline", "different migration");
  const calls: VerificationCommand[] = [];
  const result = runRegistryVerification(root, {}, dependencies([
    dbPassed()
  ], calls));

  assert.equal(result.status, "blocked");
  assert.match(result.evidence.detail, /checksums differ/);
  assert.deepEqual(calls.map((command) => command.step), ["db_check_before"]);
});

test("source identity change during verification discards the completed result", () => {
  const root = fixtureRepo();
  let commitReads = 0;
  const base = dependencies([
    dbPassed(), passed(), passed(),
    passed(`# postgresql-version: 17.10\n# temporary-database-created: ${testDatabase}\n# temporary-database-cleanup: ${testDatabase}`),
    dbPassed()
  ]);
  const result = runRegistryVerification(root, {}, {
    ...base,
    readCommitSha: () => commitReads++ === 0 ? "a".repeat(40) : "b".repeat(40)
  });

  assert.equal(result.status, "recovery_required");
  assert.match(result.evidence.detail, /source identity changed/);
});

test("verification accepts local or dev execution only against jkadh_dev", () => {
  const base = {
    host: "192.168.219.125", port: 35432, database: "jkadh_dev", user: "devdbusr", password: "secret"
  };
  assert.deepEqual(validateRegistryVerificationConfig({ ...base, env: "local" }), []);
  assert.deepEqual(validateRegistryVerificationConfig({ ...base, env: "dev" }), []);
  assert.match(validateRegistryVerificationConfig({ ...base, env: "prd" }).join(";"), /local or dev/);
  assert.match(validateRegistryVerificationConfig({ ...base, env: "local", database: "jkadh_prd" }).join(";"), /jkadh_dev/);
});

test("verification blocks when the target DB is not at pre-registry migration 7", () => {
  const result = runRegistryVerification(fixtureRepo(), {}, dependencies([
    passed("- [info] version: PostgreSQL 17.10\n- [pass] migration: 8")
  ]));

  assert.equal(result.status, "blocked");
  assert.match(result.evidence.detail, /pre-registry migration 7.*8/);
});

test("verification requires migration 7 to remain unchanged after integration", () => {
  const result = runRegistryVerification(fixtureRepo(), {}, dependencies([
    dbPassed(), passed(), passed(),
    passed(`# postgresql-version: 17.10\n# temporary-database-created: ${testDatabase}\n# temporary-database-cleanup: ${testDatabase}`),
    passed("- [info] version: PostgreSQL 17.10\n- [pass] migration: 8")
  ]));

  assert.equal(result.status, "recovery_required");
  assert.match(result.evidence.detail, /migration changed.*before=7; after=8/);
});

test("verification evidence cannot be written into source or an arbitrary path", () => {
  const root = fixtureRepo();
  assert.throws(
    () => runRegistryVerification(root, { evidenceFile: "packages/harness-cli/src/evidence.json" }, dependencies([])),
    /must be a file under.*\.hcp.*verification/
  );
});

test("package and CLI expose one registry verification flow without legacy gate options", () => {
  const repoRoot = join(import.meta.dirname, "../../..");
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "packages/harness-cli/package.json"), "utf8"));
  const cli = readFileSync(join(repoRoot, "packages/harness-cli/src/cli.ts"), "utf8");
  assert.match(packageJson.scripts["verify:registry"], /db registry-verify/);
  assert.equal(packageJson.scripts["verify:registry:offline"], undefined);
  assert.equal(packageJson.scripts["verify:registry:target"], undefined);
  assert.match(cli, /--gate was removed/);
  assert.doesNotMatch(cli, /db-independent\|ephemeral-postgresql\|target-dev-db/);
});

function fixtureRepo(baseline = "registry ddl", migration = baseline): string {
  const root = mkdtempSync(join(tmpdir(), "jkadh-registry-verification-"));
  write(root, ".env", [
    "JKADH_ENV=local",
    "JKADH_DB_HOST=192.168.219.125",
    "JKADH_DB_PORT=35432",
    "JKADH_DB_NAME=jkadh_dev",
    "JKADH_DB_USER=devdbusr",
    "JKADH_DB_PASSWORD=secret"
  ].join("\n"));
  write(root, "packages/harness-cli/baseline/003_create_hcp_registry.sql", baseline);
  write(root, "packages/harness-cli/migrations/011_create_hcp_registry_tables.sql", migration);
  write(root, "packages/harness-cli/src/fixture.ts", "export {};\n");
  write(root, "packages/harness-cli/test/fixture.test.ts", "export {};\n");
  write(root, "packages/harness-cli/package.json", "{}\n");
  write(root, "packages/harness-cli/package-lock.json", "{}\n");
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function dependencies(
  results: VerificationCommandResult[],
  calls: VerificationCommand[] = []
): RegistryVerificationDependencies {
  const queue = [...results];
  return {
    now: () => new Date("2026-08-05T00:00:00.000Z"),
    readCommitSha: () => "a".repeat(40),
    env: {},
    runCommand(command) {
      calls.push(command);
      return queue.shift() ?? failed("unexpected verification command");
    }
  };
}

function passed(stdout = ""): VerificationCommandResult {
  return { exitCode: 0, stdout, stderr: "", durationMs: 1 };
}

function dbPassed(): VerificationCommandResult {
  return passed("- [info] version: PostgreSQL 17.10\n- [pass] migration: 7");
}

function failed(stderr: string): VerificationCommandResult {
  return { exitCode: 1, stdout: "", stderr, durationMs: 1 };
}
